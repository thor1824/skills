[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('run', 'complete', 'status', 'cleanup')]
    [string]$Command = 'run',

    [string]$IssuePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Diagnostic {
    param([string]$Message)

    [Console]::Error.WriteLine($Message)
}

function Exit-Json {
    param(
        [hashtable]$Payload,
        [int]$Code = 0
    )

    $Payload | ConvertTo-Json -Depth 12
    exit $Code
}

function Fail-Invocation {
    param([string]$Message)

    Write-Diagnostic $Message
    exit 1
}

function Invoke-Git {
    param(
        [string]$RepoPath,
        [string[]]$Arguments
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git -C $RepoPath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
        $rendered = if ($Arguments.Count -gt 0) { $Arguments -join ' ' } else { '<none>' }
        throw "git $rendered failed: $output"
    }

    if ($null -eq $output) {
        return ,@()
    }

    return ,@($output)
}

function Try-Invoke-Git {
    param(
        [string]$RepoPath,
        [string[]]$Arguments
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git -C $RepoPath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    return @{
        Success = ($exitCode -eq 0)
        Output = ,@($output)
    }
}

function Get-RepoTopLevel {
    $output = & git rev-parse --show-toplevel 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Not inside a git repository: $output"
    }

    return (Resolve-Path -LiteralPath (@($output)[0])).Path
}

function Assert-RepoRootContext {
    param([string]$RepoRoot)

    $current = (Resolve-Path -LiteralPath (Get-Location)).Path
    if ($current -ne $RepoRoot) {
        throw "Run issue-manager from the repository root. Current directory: $current. Repository root: $RepoRoot."
    }

    $parent = Split-Path -Path $RepoRoot -Parent
    if ((Split-Path -Path $parent -Leaf) -eq '.worktrees') {
        throw "Issue-manager cannot run from a managed worker worktree."
    }
}

function Get-RelativeRepoPath {
    param(
        [string]$RepoRoot,
        [string]$AbsolutePath
    )

    $repoUri = [Uri]("$RepoRoot\")
    $pathUri = [Uri]$AbsolutePath
    return [Uri]::UnescapeDataString($repoUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

function Resolve-RepoPath {
    param(
        [string]$RepoRoot,
        [string]$RepoRelativePath
    )

    $parts = $RepoRelativePath -split '/'
    return (Join-Path -Path $RepoRoot -ChildPath ([IO.Path]::Combine($parts)))
}

function Get-ManagedBranchNames {
    param([string]$RepoRoot)

    $output = Invoke-Git -RepoPath $RepoRoot -Arguments @('for-each-ref', 'refs/heads/agent', '--format=%(refname:short)')
    return @($output | Where-Object { $_ })
}

function Get-ManagedWorktreeDirectories {
    param([string]$RepoRoot)

    $worktreeRoot = Join-Path -Path $RepoRoot -ChildPath '.worktrees'
    if (-not (Test-Path -LiteralPath $worktreeRoot)) {
        return @()
    }

    return @(Get-ChildItem -LiteralPath $worktreeRoot -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'agent-*' } | ForEach-Object { $_.FullName })
}

function Test-GitIgnoreEntry {
    param(
        [string]$RepoRoot,
        [string]$Entry
    )

    $gitIgnore = Join-Path -Path $RepoRoot -ChildPath '.gitignore'
    if (-not (Test-Path -LiteralPath $gitIgnore)) {
        return $false
    }

    $content = Get-Content -LiteralPath $gitIgnore
    return $content -contains $Entry
}

function Get-StatusMapping {
    param([string]$RepoRoot)

    $path = Join-Path -Path $RepoRoot -ChildPath 'docs/agents/triage-labels.md'
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing required file docs/agents/triage-labels.md."
    }

    $content = Get-Content -LiteralPath $path -Raw
    $mappings = @{}
    foreach ($state in @('ready-for-agent', 'in-progress', 'done', 'ready-for-human')) {
        $escaped = [Regex]::Escape($state)
        $pattern = '(?m)^\|\s*`' + $escaped + '`\s*\|\s*`([^`]+)`\s*\|'
        $match = [Regex]::Match($content, $pattern)
        if (-not $match.Success) {
            throw "Missing required status mapping for $state in docs/agents/triage-labels.md."
        }

        $mappings[$state] = $match.Groups[1].Value.Trim()
    }

    return $mappings
}

function Assert-Prerequisites {
    param([string]$RepoRoot)

    $requiredFiles = @(
        'docs/agents/issue-tracker.md',
        'docs/agents/triage-labels.md',
        'docs/agents/domain.md'
    )

    foreach ($relative in $requiredFiles) {
        $absolute = Resolve-RepoPath -RepoRoot $RepoRoot -RepoRelativePath $relative
        if (-not (Test-Path -LiteralPath $absolute)) {
            throw "Missing required file $relative. Run /prepare-repo first."
        }
    }

    $trackerContent = Get-Content -LiteralPath (Resolve-RepoPath -RepoRoot $RepoRoot -RepoRelativePath 'docs/agents/issue-tracker.md') -Raw
    if ($trackerContent -notmatch '\.scratch/') {
        throw "docs/agents/issue-tracker.md does not describe the local markdown tracker under .scratch/."
    }

    foreach ($entry in @('.worktrees/', '.agents/issue-manager/')) {
        if (-not (Test-GitIgnoreEntry -RepoRoot $RepoRoot -Entry $entry)) {
            throw ".gitignore must contain $entry. Run /prepare-repo first."
        }
    }

    return Get-StatusMapping -RepoRoot $RepoRoot
}

function Get-PrerequisitesOrBlocked {
    param([string]$RepoRoot)

    try {
        return @{
            Ok = $true
            StatusMapping = (Assert-Prerequisites -RepoRoot $RepoRoot)
        }
    }
    catch {
        return @{
            Ok = $false
            Payload = @{
                status = 'blocked'
                phase = 'preflight'
                reasonCode = 'missing-prereqs'
                message = $_.Exception.Message
            }
        }
    }
}

function Get-FrontMatterRange {
    param([string]$Content)

    if ($Content -notmatch "(?s)\A---\r?\n(.*?)\r?\n---\r?\n?") {
        throw 'Missing YAML front matter.'
    }

    return @{
        Raw = $Matches[1]
        FullMatchLength = $Matches[0].Length
    }
}

function Parse-BlockedByValue {
    param(
        [string[]]$Lines,
        [ref]$Index
    )

    $currentLine = $Lines[$Index.Value]
    $value = ($currentLine -replace '^\s*blocked_by:\s*', '').Trim()
    if ($value -eq '[]') {
        return @()
    }

    if ($value -ne '') {
        throw 'blocked_by must be an explicit YAML list of strings or [].'
    }

    $items = @()
    for ($i = $Index.Value + 1; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        if ($line -match '^\s+-\s+(.+?)\s*$') {
            $item = $Matches[1].Trim().Trim('"').Trim("'")
            $items += $item
            $Index.Value = $i
            continue
        }

        if ($line -match '^\s*$') {
            $Index.Value = $i
            continue
        }

        $Index.Value = $i - 1
        break
    }

    return $items
}

function Parse-IssueFile {
    param(
        [string]$RepoRoot,
        [string]$AbsolutePath
    )

    $content = Get-Content -LiteralPath $AbsolutePath -Raw
    $frontMatterInfo = Get-FrontMatterRange -Content $content
    $frontMatterLines = @($frontMatterInfo.Raw -split "\r?\n")
    $parsed = @{
        blocked_by = @()
    }

    for ($i = 0; $i -lt $frontMatterLines.Count; $i++) {
        $line = $frontMatterLines[$i]
        if ($line -match '^\s*$') {
            continue
        }

        if ($line -match '^\s*blocked_by:\s*(.*)$') {
            $cursor = [ref]$i
            $parsed.blocked_by = @(Parse-BlockedByValue -Lines $frontMatterLines -Index $cursor)
            $i = $cursor.Value
            continue
        }

        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$') {
            $key = $Matches[1]
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            $parsed[$key] = $value
            continue
        }
    }

    $repoRelativePath = Get-RelativeRepoPath -RepoRoot $RepoRoot -AbsolutePath $AbsolutePath
    $pathMatch = [Regex]::Match($repoRelativePath, '^\.scratch/([^/]+)/issues/([^/]+)\.md$')
    $featureSlug = if ($pathMatch.Success) { $pathMatch.Groups[1].Value } else { $null }
    $issueStem = if ($pathMatch.Success) { $pathMatch.Groups[2].Value } else { [IO.Path]::GetFileNameWithoutExtension($AbsolutePath) }

    return [pscustomobject]@{
        AbsolutePath = $AbsolutePath
        RepoRelativePath = $repoRelativePath
        Content = $content
        FrontMatter = $parsed
        FeatureSlug = $featureSlug
        IssueStem = $issueStem
        IssueId = if ($featureSlug) { "$featureSlug-$issueStem" } else { $issueStem }
    }
}

function Get-LatestAgentBriefSection {
    param([string]$Content)

    $headingMatches = [Regex]::Matches($Content, '(?m)^## Agent Brief\s*$')
    if ($headingMatches.Count -eq 0) {
        return $null
    }

    $start = $headingMatches[$headingMatches.Count - 1].Index
    $remaining = $Content.Substring($start)
    $nextHeadings = [Regex]::Matches($remaining, '(?m)^## .+$')
    if ($nextHeadings.Count -gt 1) {
        return $remaining.Substring(0, $nextHeadings[1].Index).Trim()
    }

    return $remaining.Trim()
}

function Test-AgentBriefValid {
    param([string]$Content)

    $brief = Get-LatestAgentBriefSection -Content $Content
    if (-not $brief) {
        return $false
    }

    $requiredMarkers = @(
        '\*\*Current behavior:\*\*',
        '\*\*Desired behavior:\*\*',
        '\*\*Key interfaces:\*\*',
        '\*\*Acceptance criteria:\*\*',
        '\*\*Out of scope:\*\*'
    )

    foreach ($marker in $requiredMarkers) {
        if ($brief -notmatch $marker) {
            return $false
        }
    }

    return $true
}

function Set-IssueStatus {
    param(
        [string]$AbsolutePath,
        [string]$NewStatus
    )

    $content = Get-Content -LiteralPath $AbsolutePath -Raw
    $updated = [Regex]::Replace($content, '(?m)^status:\s*.*$', "status: $NewStatus", 1)
    if ($updated -eq $content) {
        throw "Unable to update status in $AbsolutePath."
    }

    Set-Content -LiteralPath $AbsolutePath -Value $updated -NoNewline
}

function Test-IssueValidForAgent {
    param(
        $Issue,
        [hashtable]$StatusMapping,
        [string]$RepoRoot
    )

    $errors = [System.Collections.Generic.List[string]]::new()
    if ($Issue.FrontMatter.type -ne 'Issue') {
        $errors.Add('Missing or invalid type: expected type: Issue.')
    }

    if ([string]::IsNullOrWhiteSpace($Issue.FrontMatter.category)) {
        $errors.Add('Missing category.')
    }
    elseif ($Issue.FrontMatter.category -notin @('bug', 'enhancement')) {
        $errors.Add('Invalid category value.')
    }

    if (-not $Issue.FrontMatter.ContainsKey('blocked_by')) {
        $errors.Add('Missing blocked_by field.')
    }
    else {
        foreach ($blocker in $Issue.FrontMatter.blocked_by) {
            if ($blocker -notmatch '^\.scratch/.+/issues/.+\.md$') {
                $errors.Add("Invalid blocker reference format: $blocker")
                continue
            }

            $blockerAbsolute = Resolve-RepoPath -RepoRoot $RepoRoot -RepoRelativePath $blocker
            if (-not (Test-Path -LiteralPath $blockerAbsolute)) {
                $errors.Add("Missing blocker issue file: $blocker")
            }
        }
    }

    if (-not (Test-AgentBriefValid -Content $Issue.Content)) {
        $errors.Add('Missing or invalid ## Agent Brief.')
    }

    return $errors
}

function Get-IssueCatalog {
    param(
        [string]$RepoRoot,
        [hashtable]$StatusMapping
    )

    $issueRoot = Join-Path -Path $RepoRoot -ChildPath '.scratch'
    if (-not (Test-Path -LiteralPath $issueRoot)) {
        return @{
            Eligible = @()
            InvalidReady = @()
            BlockedReady = @()
            InProgress = @()
            ReadyForHuman = @()
        }
    }

    $issueFiles = @(Get-ChildItem -LiteralPath $issueRoot -Recurse -File -Filter '*.md' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '[\\/]issues[\\/].+\.md$' })
    $parsedIssues = @{}
    foreach ($file in $issueFiles) {
        $issue = Parse-IssueFile -RepoRoot $RepoRoot -AbsolutePath $file.FullName
        $parsedIssues[$issue.RepoRelativePath] = $issue
    }

    $eligible = [System.Collections.Generic.List[object]]::new()
    $invalidReady = [System.Collections.Generic.List[object]]::new()
    $blockedReady = [System.Collections.Generic.List[object]]::new()
    $inProgress = [System.Collections.Generic.List[object]]::new()
    $readyForHuman = [System.Collections.Generic.List[object]]::new()

    foreach ($issue in ($parsedIssues.Values | Sort-Object RepoRelativePath)) {
        $status = $issue.FrontMatter.status
        if ($status -eq $StatusMapping['in-progress']) {
            $inProgress.Add($issue)
            continue
        }

        if ($status -eq $StatusMapping['ready-for-human']) {
            $readyForHuman.Add($issue)
            continue
        }

        if ($status -ne $StatusMapping['ready-for-agent']) {
            continue
        }

        $errors = @(Test-IssueValidForAgent -Issue $issue -StatusMapping $StatusMapping -RepoRoot $RepoRoot)
        if ($errors.Count -gt 0) {
            $invalidReady.Add([pscustomobject]@{
                Issue = $issue
                Errors = $errors
            })
            continue
        }

        $unresolved = @()
        foreach ($blocker in $issue.FrontMatter.blocked_by) {
            $blockerIssue = $parsedIssues[$blocker]
            if (-not $blockerIssue) {
                $errors += "Missing blocker issue file: $blocker"
                continue
            }

            if ($blockerIssue.FrontMatter.status -ne $StatusMapping['done']) {
                $unresolved += $blocker
            }
        }

        if ($errors.Count -gt 0) {
            $invalidReady.Add([pscustomobject]@{
                Issue = $issue
                Errors = $errors
            })
            continue
        }

        if ($unresolved.Count -gt 0) {
            $blockedReady.Add([pscustomobject]@{
                Issue = $issue
                UnresolvedBlockers = $unresolved
            })
            continue
        }

        $eligible.Add($issue)
    }

    return @{
        Eligible = @($eligible)
        InvalidReady = @($invalidReady)
        BlockedReady = @($blockedReady)
        InProgress = @($inProgress)
        ReadyForHuman = @($readyForHuman)
    }
}

function Get-CurrentBranchName {
    param([string]$RepoRoot)

    return (Invoke-Git -RepoPath $RepoRoot -Arguments @('branch', '--show-current'))[0]
}

function Get-GitStatusPorcelain {
    param([string]$RepoRoot)

    return @(Invoke-Git -RepoPath $RepoRoot -Arguments @('status', '--porcelain') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-IssueArtifacts {
    param(
        [string]$RepoRoot,
        $Issue
    )

    $branchName = "agent/$($Issue.FeatureSlug)-$($Issue.IssueStem)"
    $worktreeName = "agent-$($Issue.FeatureSlug)-$($Issue.IssueStem)"
    $worktreePath = Join-Path -Path (Join-Path -Path $RepoRoot -ChildPath '.worktrees') -ChildPath $worktreeName
    $reportRelativePath = ".agents/issue-manager/reports/$($Issue.FeatureSlug)-$($Issue.IssueStem).md"
    $reportAbsolutePath = Resolve-RepoPath -RepoRoot $worktreePath -RepoRelativePath $reportRelativePath

    return @{
        BranchName = $branchName
        WorktreeName = $worktreeName
        WorktreePath = $worktreePath
        ReportRelativePath = $reportRelativePath
        ReportAbsolutePath = $reportAbsolutePath
    }
}

function Get-ManagedWorktreeState {
    param(
        [string]$RepoRoot,
        [string]$WorktreePath
    )

    if (-not (Test-Path -LiteralPath $WorktreePath)) {
        return $null
    }

    $status = Try-Invoke-Git -RepoPath $WorktreePath -Arguments @('status', '--porcelain')
    $branch = Try-Invoke-Git -RepoPath $WorktreePath -Arguments @('branch', '--show-current')
    $head = Try-Invoke-Git -RepoPath $WorktreePath -Arguments @('rev-parse', 'HEAD')

    return @{
        StatusOk = $status.Success
        StatusOutput = @($status.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        BranchOk = $branch.Success
        BranchName = if ($branch.Success) { $branch.Output[0] } else { $null }
        HeadOk = $head.Success
        Head = if ($head.Success) { $head.Output[0] } else { $null }
    }
}

function Get-ManualRecoverySteps {
    param(
        [string]$RepoRoot,
        [string[]]$ManagedBranches,
        [string[]]$ManagedWorktrees,
        [object[]]$InProgressIssues
    )

    $steps = [System.Collections.Generic.List[string]]::new()
    foreach ($branch in $ManagedBranches) {
        $steps.Add("Inspect branch $branch and delete it manually when safe: git branch -D $branch")
    }

    foreach ($worktree in $ManagedWorktrees) {
        $steps.Add("Inspect worktree $worktree and remove it manually when safe: git worktree remove --force `"$worktree`"")
    }

    foreach ($issue in $InProgressIssues) {
        $steps.Add("Review issue $($issue.RepoRelativePath) and decide whether to keep it in-progress or move it back to ready-for-agent manually.")
    }

    return @($steps)
}

function New-PreflightSummary {
    param(
        [string]$RepoRoot,
        [hashtable]$StatusMapping
    )

    $catalog = Get-IssueCatalog -RepoRoot $RepoRoot -StatusMapping $StatusMapping
    $managedBranches = @(Get-ManagedBranchNames -RepoRoot $RepoRoot)
    $managedWorktrees = @(Get-ManagedWorktreeDirectories -RepoRoot $RepoRoot)

    $completedLeftovers = [System.Collections.Generic.List[object]]::new()
    foreach ($branch in $managedBranches) {
        $branchMatch = [Regex]::Match($branch, '^agent/(.+)$')
        if (-not $branchMatch.Success) {
            continue
        }

        $suffix = $branchMatch.Groups[1].Value
        $worktreePath = Join-Path -Path (Join-Path -Path $RepoRoot -ChildPath '.worktrees') -ChildPath ("agent-$suffix")
        if (-not (Test-Path -LiteralPath $worktreePath)) {
            continue
        }

        $state = Get-ManagedWorktreeState -RepoRoot $RepoRoot -WorktreePath $worktreePath
        if (-not $state -or -not $state.StatusOk -or $state.StatusOutput.Count -ne 0) {
            continue
        }

        $issueId = $suffix
        $issueMatch = [Regex]::Match($issueId, '^(.+)-([0-9]{2}-.+)$')
        if (-not $issueMatch.Success) {
            continue
        }

        $issueRelative = ".scratch/$($issueMatch.Groups[1].Value)/issues/$($issueMatch.Groups[2].Value).md"
        $issueAbsolute = Resolve-RepoPath -RepoRoot $worktreePath -RepoRelativePath $issueRelative
        if (-not (Test-Path -LiteralPath $issueAbsolute)) {
            continue
        }

        $issue = Parse-IssueFile -RepoRoot $worktreePath -AbsolutePath $issueAbsolute
        if ($issue.FrontMatter.status -eq $StatusMapping['done']) {
            $completedLeftovers.Add([pscustomobject]@{
                Branch = $branch
                WorktreePath = $worktreePath
                IssuePath = $issueRelative
            })
        }
    }

    return @{
        Eligible = @($catalog.Eligible)
        InvalidReady = @($catalog.InvalidReady)
        BlockedReady = @($catalog.BlockedReady)
        InProgress = @($catalog.InProgress)
        ReadyForHuman = @($catalog.ReadyForHuman)
        ManagedBranches = $managedBranches
        ManagedWorktrees = $managedWorktrees
        CompletedLeftovers = @($completedLeftovers)
    }
}

function Invoke-Run {
    param([string]$RepoRoot)

    $prereqs = Get-PrerequisitesOrBlocked -RepoRoot $RepoRoot
    if (-not $prereqs.Ok) {
        Exit-Json $prereqs.Payload
    }

    $statusMapping = $prereqs.StatusMapping
    $preflight = New-PreflightSummary -RepoRoot $RepoRoot -StatusMapping $statusMapping

    $dirty = @(Get-GitStatusPorcelain -RepoRoot $RepoRoot)
    if ($dirty.Count -gt 0) {
        Exit-Json @{
            status = 'blocked'
            phase = 'preflight'
            reasonCode = 'dirty-repo'
            message = 'The repository is dirty. Commit, stash, or discard changes before running issue-manager.'
            dirtyFiles = $dirty
            preflight = @{
                eligibleCount = $preflight.Eligible.Count
                blockedCount = $preflight.BlockedReady.Count
                invalidCount = $preflight.InvalidReady.Count
                inProgressCount = $preflight.InProgress.Count
                readyForHumanCount = $preflight.ReadyForHuman.Count
            }
        }
    }

    if ($preflight.ManagedBranches.Count -gt 0) {
        Exit-Json @{
            status = 'blocked'
            phase = 'preflight'
            reasonCode = 'managed-branch-exists'
            message = 'Managed worker branches already exist. Resolve them before starting a new run.'
            managedBranches = $preflight.ManagedBranches
            manualRecovery = @(Get-ManualRecoverySteps -RepoRoot $RepoRoot -ManagedBranches $preflight.ManagedBranches -ManagedWorktrees $preflight.ManagedWorktrees -InProgressIssues $preflight.InProgress)
        }
    }

    if ($preflight.ManagedWorktrees.Count -gt 0) {
        Exit-Json @{
            status = 'blocked'
            phase = 'preflight'
            reasonCode = 'managed-worktree-exists'
            message = 'Managed worker worktrees already exist. Resolve them before starting a new run.'
            managedWorktrees = $preflight.ManagedWorktrees
            manualRecovery = @(Get-ManualRecoverySteps -RepoRoot $RepoRoot -ManagedBranches $preflight.ManagedBranches -ManagedWorktrees $preflight.ManagedWorktrees -InProgressIssues $preflight.InProgress)
        }
    }

    if ($preflight.Eligible.Count -eq 0) {
        Exit-Json @{
            status = 'idle'
            message = 'No eligible ready-for-agent issues remain.'
            preflight = @{
                eligibleCount = 0
                blockedCount = $preflight.BlockedReady.Count
                invalidCount = $preflight.InvalidReady.Count
                inProgressCount = $preflight.InProgress.Count
                readyForHumanCount = $preflight.ReadyForHuman.Count
            }
            blockedIssues = @($preflight.BlockedReady | ForEach-Object {
                @{
                    issuePath = $_.Issue.RepoRelativePath
                    blockers = $_.UnresolvedBlockers
                }
            })
            invalidIssues = @($preflight.InvalidReady | ForEach-Object {
                @{
                    issuePath = $_.Issue.RepoRelativePath
                    errors = $_.Errors
                }
            })
            inProgressIssues = @($preflight.InProgress | ForEach-Object { $_.RepoRelativePath })
            readyForHumanIssues = @($preflight.ReadyForHuman | ForEach-Object { $_.RepoRelativePath })
        }
    }

    $issue = $preflight.Eligible[0]
    $integrationBranch = Get-CurrentBranchName -RepoRoot $RepoRoot
    $artifacts = Get-IssueArtifacts -RepoRoot $RepoRoot -Issue $issue

    try {
        Set-IssueStatus -AbsolutePath $issue.AbsolutePath -NewStatus $statusMapping['in-progress']
        Invoke-Git -RepoPath $RepoRoot -Arguments @('add', '--', $issue.RepoRelativePath) | Out-Null
        Invoke-Git -RepoPath $RepoRoot -Arguments @('commit', '-m', "chore(issue-manager): claim $($issue.IssueId)") | Out-Null
    }
    catch {
        Exit-Json @{
            status = 'blocked'
            phase = 'claim'
            reasonCode = 'claim-failed'
            message = $_.Exception.Message
            issuePath = $issue.RepoRelativePath
        }
    }

    try {
        $prepareStep = 'create branch'
        Invoke-Git -RepoPath $RepoRoot -Arguments @('branch', $artifacts.BranchName, 'HEAD') | Out-Null
        $prepareStep = 'create worktree root'
        $worktreeRoot = Split-Path -Path $artifacts.WorktreePath -Parent
        if (-not (Test-Path -LiteralPath $worktreeRoot)) {
            New-Item -ItemType Directory -Path $worktreeRoot | Out-Null
        }

        $prepareStep = 'add worktree'
        Invoke-Git -RepoPath $RepoRoot -Arguments @('worktree', 'add', $artifacts.WorktreePath, $artifacts.BranchName) | Out-Null
        $prepareStep = 'verify checked out branch'
        $checkedOutBranch = (Invoke-Git -RepoPath $artifacts.WorktreePath -Arguments @('branch', '--show-current'))[0]
        if ($checkedOutBranch -ne $artifacts.BranchName) {
            throw "Worker worktree is on $checkedOutBranch instead of $($artifacts.BranchName)."
        }

        $prepareStep = 'create report directory'
        $reportDir = Split-Path -Path $artifacts.ReportAbsolutePath -Parent
        if (-not (Test-Path -LiteralPath $reportDir)) {
            New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
        }
    }
    catch {
        Exit-Json @{
            status = 'blocked'
            phase = 'prepare-worker'
            reasonCode = 'prepare-worker-failed'
            message = "$prepareStep failed: $($_.Exception.Message)"
            issuePath = $issue.RepoRelativePath
            workerBranch = $artifacts.BranchName
            worktreePath = $artifacts.WorktreePath
        }
    }

    Exit-Json @{
        status = 'claimed'
        issuePath = $issue.RepoRelativePath
        issueId = $issue.IssueId
        featureSlug = $issue.FeatureSlug
        issueStem = $issue.IssueStem
        integrationBranch = $integrationBranch
        workerBranch = $artifacts.BranchName
        worktreePath = $artifacts.WorktreePath
        reportPath = $artifacts.ReportAbsolutePath
        reportRelativePath = $artifacts.ReportRelativePath
        preflight = @{
            eligibleCount = $preflight.Eligible.Count
            blockedCount = $preflight.BlockedReady.Count
            invalidCount = $preflight.InvalidReady.Count
            inProgressCount = $preflight.InProgress.Count
            readyForHumanCount = $preflight.ReadyForHuman.Count
        }
    }
}

function Invoke-Complete {
    param(
        [string]$RepoRoot,
        [string]$IssuePath
    )

    if ([string]::IsNullOrWhiteSpace($IssuePath)) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'missing-issue-path'
            message = 'complete requires the claimed issue path.'
        }
    }

    $prereqs = Get-PrerequisitesOrBlocked -RepoRoot $RepoRoot
    if (-not $prereqs.Ok) {
        Exit-Json $prereqs.Payload
    }

    $statusMapping = $prereqs.StatusMapping
    $managedBranches = @(Get-ManagedBranchNames -RepoRoot $RepoRoot)
    $managedWorktrees = @(Get-ManagedWorktreeDirectories -RepoRoot $RepoRoot)

    if ($managedBranches.Count -ne 1 -or $managedWorktrees.Count -ne 1) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'inconsistent-managed-artifacts'
            message = 'complete requires exactly one managed branch and one managed worktree.'
            managedBranches = $managedBranches
            managedWorktrees = $managedWorktrees
        }
    }

    $branchName = $managedBranches[0]
    $worktreePath = $managedWorktrees[0]
    $branchSuffix = [Regex]::Match($branchName, '^agent/(.+)$')
    $worktreeSuffix = [Regex]::Match((Split-Path -Path $worktreePath -Leaf), '^agent-(.+)$')
    if (-not $branchSuffix.Success -or -not $worktreeSuffix.Success -or $branchSuffix.Groups[1].Value -ne $worktreeSuffix.Groups[1].Value) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'managed-artifact-mismatch'
            message = 'Managed branch and worktree do not map to the same issue id.'
            workerBranch = $branchName
            worktreePath = $worktreePath
        }
    }

    $activeIssueId = $branchSuffix.Groups[1].Value
    $issueMatch = [Regex]::Match($activeIssueId, '^(.+)-([0-9]{2}-.+)$')
    if (-not $issueMatch.Success) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'invalid-managed-issue-id'
            message = "Managed branch $branchName does not map to <feature-slug>-<issue-stem>."
        }
    }

    $expectedIssuePath = ".scratch/$($issueMatch.Groups[1].Value)/issues/$($issueMatch.Groups[2].Value).md"
    if ($IssuePath -ne $expectedIssuePath) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'claimed-issue-mismatch'
            message = 'complete was asked to finish a different issue than the active managed worker.'
            expectedIssuePath = $expectedIssuePath
            actualIssuePath = $IssuePath
        }
    }

    $state = Get-ManagedWorktreeState -RepoRoot $RepoRoot -WorktreePath $worktreePath
    if (-not $state.StatusOk -or -not $state.BranchOk -or -not $state.HeadOk) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'unreadable-worker-state'
            message = 'Could not read worker worktree state.'
            workerBranch = $branchName
            worktreePath = $worktreePath
        }
    }

    if ($state.BranchName -ne $branchName) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'worker-on-wrong-branch'
            message = 'Worker worktree is not checked out on the expected managed branch.'
            workerBranch = $branchName
            actualBranch = $state.BranchName
            worktreePath = $worktreePath
        }
    }

    $branchHead = (Invoke-Git -RepoPath $RepoRoot -Arguments @('rev-parse', $branchName))[0]
    if ($branchHead -ne $state.Head) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'worker-head-mismatch'
            message = 'Worker branch tip does not match the checked-out worktree HEAD.'
            workerBranch = $branchName
            worktreePath = $worktreePath
        }
    }

    if ($state.StatusOutput.Count -gt 0) {
        Exit-Json @{
            status = 'blocked'
            phase = 'worker'
            reasonCode = 'worker-dirty'
            message = 'Worker left a dirty worktree.'
            workerBranch = $branchName
            worktreePath = $worktreePath
            gitStatus = $state.StatusOutput
        }
    }

    $issueAbsolute = Resolve-RepoPath -RepoRoot $worktreePath -RepoRelativePath $IssuePath
    if (-not (Test-Path -LiteralPath $issueAbsolute)) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'missing-issue-file'
            message = 'Assigned issue file is missing from the worker worktree.'
            issuePath = $IssuePath
            workerBranch = $branchName
        }
    }

    $issue = Parse-IssueFile -RepoRoot $worktreePath -AbsolutePath $issueAbsolute
    if ($issue.FrontMatter.status -ne $statusMapping['done']) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'issue-not-done'
            message = 'Assigned issue is not marked done in the worker worktree.'
            issuePath = $IssuePath
            workerBranch = $branchName
            actualStatus = $issue.FrontMatter.status
        }
    }

    $reportPath = Resolve-RepoPath -RepoRoot $worktreePath -RepoRelativePath ".agents/issue-manager/reports/$activeIssueId.md"
    if (-not (Test-Path -LiteralPath $reportPath)) {
        Exit-Json @{
            status = 'blocked'
            phase = 'complete'
            reasonCode = 'missing-report'
            message = 'Required worker completion report is missing.'
            workerBranch = $branchName
            reportPath = $reportPath
        }
    }

    try {
        Invoke-Git -RepoPath $RepoRoot -Arguments @('merge', '--no-ff', '--no-edit', '-m', "merge(issue-manager): $activeIssueId", $branchName) | Out-Null
    }
    catch {
        $mergeStatus = Try-Invoke-Git -RepoPath $RepoRoot -Arguments @('status', '--porcelain')
        $mergeText = $_.Exception.Message + "`n" + ($mergeStatus.Output -join "`n")
        $reasonCode = if ($mergeText -match 'CONFLICT|Automatic merge failed|^UU\s') { 'merge-conflict' } else { 'merge-failed' }
        Exit-Json @{
            status = 'blocked'
            phase = 'merge'
            reasonCode = $reasonCode
            message = $_.Exception.Message
            issuePath = $IssuePath
            workerBranch = $branchName
            worktreePath = $worktreePath
        }
    }

    try {
        Invoke-Git -RepoPath $RepoRoot -Arguments @('worktree', 'remove', '--force', $worktreePath) | Out-Null
        Invoke-Git -RepoPath $RepoRoot -Arguments @('branch', '-D', $branchName) | Out-Null
    }
    catch {
        Exit-Json @{
            status = 'blocked'
            phase = 'merge'
            reasonCode = 'post-merge-cleanup-failed'
            message = $_.Exception.Message
            issuePath = $IssuePath
            workerBranch = $branchName
            worktreePath = $worktreePath
        }
    }

    Exit-Json @{
        status = 'merged'
        issuePath = $IssuePath
        issueId = $activeIssueId
        workerBranch = $branchName
        mergeCommitMessage = "merge(issue-manager): $activeIssueId"
    }
}

function Invoke-InspectionCommand {
    param(
        [string]$RepoRoot,
        [string]$CommandName
    )

    $prereqs = Get-PrerequisitesOrBlocked -RepoRoot $RepoRoot
    if (-not $prereqs.Ok) {
        Exit-Json $prereqs.Payload
    }

    $statusMapping = $prereqs.StatusMapping
    $preflight = New-PreflightSummary -RepoRoot $RepoRoot -StatusMapping $statusMapping
    $manualRecovery = Get-ManualRecoverySteps -RepoRoot $RepoRoot -ManagedBranches $preflight.ManagedBranches -ManagedWorktrees $preflight.ManagedWorktrees -InProgressIssues $preflight.InProgress

    Exit-Json @{
        status = $CommandName
        message = 'Issue-manager inspection summary.'
        eligibleIssues = @($preflight.Eligible | ForEach-Object { $_.RepoRelativePath })
        blockedReadyIssues = @($preflight.BlockedReady | ForEach-Object {
            @{
                issuePath = $_.Issue.RepoRelativePath
                blockers = $_.UnresolvedBlockers
            }
        })
        invalidReadyIssues = @($preflight.InvalidReady | ForEach-Object {
            @{
                issuePath = $_.Issue.RepoRelativePath
                errors = $_.Errors
            }
        })
        inProgressIssues = @($preflight.InProgress | ForEach-Object { $_.RepoRelativePath })
        readyForHumanIssues = @($preflight.ReadyForHuman | ForEach-Object { $_.RepoRelativePath })
        managedBranches = $preflight.ManagedBranches
        managedWorktrees = $preflight.ManagedWorktrees
        completedNotMerged = @($preflight.CompletedLeftovers)
        manualRecovery = $manualRecovery
    }
}

try {
    $repoRoot = Get-RepoTopLevel
    Assert-RepoRootContext -RepoRoot $repoRoot

    switch ($Command) {
        'run' { Invoke-Run -RepoRoot $repoRoot }
        'complete' { Invoke-Complete -RepoRoot $repoRoot -IssuePath $IssuePath }
        'status' { Invoke-InspectionCommand -RepoRoot $repoRoot -CommandName 'status' }
        'cleanup' { Invoke-InspectionCommand -RepoRoot $repoRoot -CommandName 'cleanup' }
        default { Fail-Invocation "Unknown command: $Command" }
    }
}
catch {
    Fail-Invocation $_.Exception.Message
}
