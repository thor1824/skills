[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:ManagerScript = Join-Path $script:RepoRoot 'skills\issue-manager\manager.ps1'
$script:TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("issue-manager-tests-" + [guid]::NewGuid().ToString('n'))

function New-TestFailure {
    param([string]$Message)

    throw $Message
}

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        New-TestFailure "$Message`nExpected: $Expected`nActual:   $Actual"
    }
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        New-TestFailure $Message
    }
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
        throw "git $($Arguments -join ' ') failed: $output"
    }

    return @($output)
}

function Initialize-RepoFromFixture {
    param([string]$FixtureName)

    $source = Join-Path $PSScriptRoot "fixtures\$FixtureName"
    $target = Join-Path $script:TempRoot ($FixtureName + '-' + [guid]::NewGuid().ToString('n'))
    Copy-Item -Path $source -Destination $target -Recurse

    Invoke-Git -RepoPath $target -Arguments @('init', '-b', 'main') | Out-Null
    Invoke-Git -RepoPath $target -Arguments @('config', 'user.name', 'Issue Manager Tests') | Out-Null
    Invoke-Git -RepoPath $target -Arguments @('config', 'user.email', 'issue-manager-tests@example.com') | Out-Null
    Invoke-Git -RepoPath $target -Arguments @('add', '.') | Out-Null
    Invoke-Git -RepoPath $target -Arguments @('commit', '-m', 'init') | Out-Null

    return $target
}

function Invoke-Manager {
    param(
        [string]$RepoPath,
        [string[]]$Arguments
    )

    Push-Location $RepoPath
    try {
        $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $script:ManagerScript @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "manager.ps1 $($Arguments -join ' ') failed with exit code ${exitCode}: $output"
    }

    return [pscustomobject]@{
        Raw = ($output -join "`n")
        Json = (($output -join "`n") | ConvertFrom-Json)
    }
}

function Complete-WorkerStub {
    param(
        [string]$RepoPath,
        [pscustomobject]$Claimed,
        [string]$NewText
    )

    $targetFile = Join-Path $Claimed.worktreePath 'src\app.txt'
    Set-Content -LiteralPath $targetFile -Value $NewText -NoNewline

    $issueContent = Get-Content -LiteralPath (Join-Path $Claimed.worktreePath ($Claimed.issuePath -replace '/', '\')) -Raw
    $issueContent = $issueContent -replace '(?m)^status:\s*in-progress$', 'status: done'
    Set-Content -LiteralPath (Join-Path $Claimed.worktreePath ($Claimed.issuePath -replace '/', '\')) -Value $issueContent -NoNewline

    $reportDir = Split-Path -Path $Claimed.reportPath -Parent
    if (-not (Test-Path -LiteralPath $reportDir)) {
        New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
    }

    @"
# Summary

Updated the fixture implementation.

# Files Changed

- src/app.txt
- $($Claimed.issuePath)

# Checks Run

- None

# Checks Skipped

- None

# Risks / Follow-up

- None

# Issue Status Confirmation

Set issue status to: done
"@ | Set-Content -LiteralPath $Claimed.reportPath -NoNewline

    Invoke-Git -RepoPath $Claimed.worktreePath -Arguments @('add', '--', 'src/app.txt', $Claimed.issuePath) | Out-Null
    Invoke-Git -RepoPath $Claimed.worktreePath -Arguments @('commit', '-m', 'worker: complete issue') | Out-Null
}

function Test-MissingPrereqs {
    $repo = Initialize-RepoFromFixture -FixtureName 'missing-prereqs'
    $result = Invoke-Manager -RepoPath $repo -Arguments @('run')

    Assert-Equal $result.Json.status 'blocked' 'missing-prereqs fixture should block the run.'
    Assert-Equal $result.Json.reasonCode 'missing-prereqs' 'missing-prereqs fixture should use the expected reasonCode.'
}

function Test-SingleIssueHappyPath {
    $repo = Initialize-RepoFromFixture -FixtureName 'single-issue-ready'

    $claimed = Invoke-Manager -RepoPath $repo -Arguments @('run')
    if ($claimed.Json.status -ne 'claimed') {
        New-TestFailure "single ready issue should be claimed.`nRaw manager payload:`n$($claimed.Raw)"
    }
    Assert-Equal $claimed.Json.status 'claimed' 'single ready issue should be claimed.'
    Assert-Equal $claimed.Json.issuePath '.scratch/feature-a/issues/01-update-app.md' 'claimed issue path should be stable.'

    Complete-WorkerStub -RepoPath $repo -Claimed $claimed.Json -NewText 'worker change'

    $merged = Invoke-Manager -RepoPath $repo -Arguments @('complete', '-IssuePath', $claimed.Json.issuePath)
    if ($merged.Json.status -ne 'merged') {
        New-TestFailure "completed worker should merge successfully.`nRaw manager payload:`n$($merged.Raw)"
    }
    Assert-Equal $merged.Json.status 'merged' 'completed worker should merge successfully.'

    $idle = Invoke-Manager -RepoPath $repo -Arguments @('run')
    Assert-Equal $idle.Json.status 'idle' 'manager should become idle after the only issue is merged.'
}

function Test-BlockedIssueBecomesEligibleAfterMerge {
    $repo = Initialize-RepoFromFixture -FixtureName 'dependency-chain'

    $firstClaim = Invoke-Manager -RepoPath $repo -Arguments @('run')
    Assert-Equal $firstClaim.Json.status 'claimed' 'first dependency issue should be claimed first.'
    Assert-Equal $firstClaim.Json.issuePath '.scratch/feature-b/issues/01-base-change.md' 'path order should pick the first blocker issue.'

    Complete-WorkerStub -RepoPath $repo -Claimed $firstClaim.Json -NewText 'first worker change'
    $firstMerge = Invoke-Manager -RepoPath $repo -Arguments @('complete', '-IssuePath', $firstClaim.Json.issuePath)
    Assert-Equal $firstMerge.Json.status 'merged' 'first dependency issue should merge.'

    $secondClaim = Invoke-Manager -RepoPath $repo -Arguments @('run')
    Assert-Equal $secondClaim.Json.status 'claimed' 'second issue should become eligible after blocker merge.'
    Assert-Equal $secondClaim.Json.issuePath '.scratch/feature-b/issues/02-follow-up.md' 'second claim should pick the formerly blocked issue.'
}

function Test-MergeConflictStopsTheRun {
    $repo = Initialize-RepoFromFixture -FixtureName 'single-issue-ready'

    $claimed = Invoke-Manager -RepoPath $repo -Arguments @('run')
    Assert-Equal $claimed.Json.status 'claimed' 'issue should still claim before conflict setup.'

    Set-Content -LiteralPath (Join-Path $repo 'src\app.txt') -Value 'main branch change' -NoNewline
    Invoke-Git -RepoPath $repo -Arguments @('add', '--', 'src/app.txt') | Out-Null
    Invoke-Git -RepoPath $repo -Arguments @('commit', '-m', 'main: conflicting change') | Out-Null

    Complete-WorkerStub -RepoPath $repo -Claimed $claimed.Json -NewText 'worker conflicting change'

    $complete = Invoke-Manager -RepoPath $repo -Arguments @('complete', '-IssuePath', $claimed.Json.issuePath)
    Assert-Equal $complete.Json.status 'blocked' 'merge conflict should block completion.'
    Assert-Equal $complete.Json.phase 'merge' 'merge conflict should report the merge phase.'
    Assert-Equal $complete.Json.reasonCode 'merge-conflict' 'merge conflict should surface the expected reason code.'
}

try {
    New-Item -ItemType Directory -Path $script:TempRoot | Out-Null

    Test-MissingPrereqs
    Test-SingleIssueHappyPath
    Test-BlockedIssueBecomesEligibleAfterMerge
    Test-MergeConflictStopsTheRun

    Write-Host 'issue-manager tests passed'
}
finally {
    if (Test-Path -LiteralPath $script:TempRoot) {
        Remove-Item -LiteralPath $script:TempRoot -Recurse -Force
    }
}
