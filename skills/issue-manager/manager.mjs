#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const COMMANDS = new Set(["run", "complete", "status", "cleanup"]);

function writeDiagnostic(message) {
  process.stderr.write(`${message}\n`);
}

function exitJson(payload, code = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(code);
}

function failInvocation(message) {
  writeDiagnostic(message);
  process.exit(1);
}

function splitOutput(text) {
  if (!text) {
    return [];
  }

  return text.replace(/\r/g, "").split("\n").filter((line) => line !== "");
}

function invokeProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    status: result.status ?? 1,
    output: splitOutput(combined),
    text: combined.trim(),
  };
}

function invokeGit(repoPath, args) {
  const result = invokeProcess("git", ["-C", repoPath, ...args]);
  if (result.status !== 0) {
    const rendered = args.length > 0 ? args.join(" ") : "<none>";
    throw new Error(`git ${rendered} failed: ${result.text}`);
  }

  return result.output;
}

function tryInvokeGit(repoPath, args) {
  const result = invokeProcess("git", ["-C", repoPath, ...args]);
  return {
    Success: result.status === 0,
    Output: result.output,
  };
}

function getRepoTopLevel() {
  const result = invokeProcess("git", ["rev-parse", "--show-toplevel"]);
  if (result.status !== 0 || result.output.length === 0) {
    throw new Error(`Not inside a git repository: ${result.text}`);
  }

  return fs.realpathSync(result.output[0]);
}

function assertRepoRootContext(repoRoot) {
  const current = fs.realpathSync(process.cwd());
  if (current !== repoRoot) {
    throw new Error(
      `Run issue-manager from the repository root. Current directory: ${current}. Repository root: ${repoRoot}.`,
    );
  }

  const parent = path.dirname(repoRoot);
  if (path.basename(parent) === ".worktrees") {
    throw new Error("Issue-manager cannot run from a managed worker worktree.");
  }
}

function getRelativeRepoPath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function resolveRepoPath(repoRoot, repoRelativePath) {
  return path.join(repoRoot, ...repoRelativePath.split("/"));
}

function getManagedBranchNames(repoRoot) {
  return invokeGit(repoRoot, [
    "for-each-ref",
    "refs/heads/agent",
    "--format=%(refname:short)",
  ]).filter(Boolean);
}

function getManagedWorktreeDirectories(repoRoot) {
  const worktreeRoot = path.join(repoRoot, ".worktrees");
  if (!fs.existsSync(worktreeRoot)) {
    return [];
  }

  return fs
    .readdirSync(worktreeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("agent-"))
    .map((entry) => path.join(worktreeRoot, entry.name));
}

function testGitIgnoreEntry(repoRoot, entry) {
  const gitIgnore = path.join(repoRoot, ".gitignore");
  if (!fs.existsSync(gitIgnore)) {
    return false;
  }

  return fs
    .readFileSync(gitIgnore, "utf8")
    .replace(/\r/g, "")
    .split("\n")
    .includes(entry);
}

function getStatusMapping(repoRoot) {
  const targetPath = path.join(repoRoot, "docs/agents/triage-labels.md");
  if (!fs.existsSync(targetPath)) {
    throw new Error("Missing required file docs/agents/triage-labels.md.");
  }

  const content = fs.readFileSync(targetPath, "utf8");
  const mappings = {};

  for (const state of ["ready-for-agent", "in-progress", "done", "ready-for-human"]) {
    const escaped = state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("^\\|\\s*`" + escaped + "`\\s*\\|\\s*`([^`]+)`\\s*\\|", "m");
    const match = content.match(pattern);
    if (!match) {
      throw new Error(`Missing required status mapping for ${state} in docs/agents/triage-labels.md.`);
    }

    mappings[state] = match[1].trim();
  }

  return mappings;
}

function assertPrerequisites(repoRoot) {
  for (const relative of [
    "docs/agents/issue-tracker.md",
    "docs/agents/triage-labels.md",
    "docs/agents/domain.md",
  ]) {
    if (!fs.existsSync(resolveRepoPath(repoRoot, relative))) {
      throw new Error(`Missing required file ${relative}. Run /prepare-repo first.`);
    }
  }

  const trackerContent = fs.readFileSync(
    resolveRepoPath(repoRoot, "docs/agents/issue-tracker.md"),
    "utf8",
  );
  if (!trackerContent.match(/\.scratch\//)) {
    throw new Error("docs/agents/issue-tracker.md does not describe the local markdown tracker under .scratch/.");
  }

  for (const entry of [".worktrees/", ".agents/issue-manager/"]) {
    if (!testGitIgnoreEntry(repoRoot, entry)) {
      throw new Error(`.gitignore must contain ${entry}. Run /prepare-repo first.`);
    }
  }

  return getStatusMapping(repoRoot);
}

function getPrerequisitesOrBlocked(repoRoot) {
  try {
    return {
      Ok: true,
      StatusMapping: assertPrerequisites(repoRoot),
    };
  } catch (error) {
    return {
      Ok: false,
      Payload: {
        status: "blocked",
        phase: "preflight",
        reasonCode: "missing-prereqs",
        message: error.message,
      },
    };
  }
}

function getFrontMatterRange(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error("Missing YAML front matter.");
  }

  return {
    raw: match[1],
    fullMatchLength: match[0].length,
  };
}

function parseBlockedByValue(lines, startIndex) {
  const currentLine = lines[startIndex];
  const value = currentLine.replace(/^\s*blocked_by:\s*/, "").trim();
  if (value === "[]") {
    return { items: [], index: startIndex };
  }

  if (value !== "") {
    throw new Error("blocked_by must be an explicit YAML list of strings or [].");
  }

  const items = [];
  let index = startIndex;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const itemMatch = line.match(/^\s+-\s+(.+?)\s*$/);
    if (itemMatch) {
      items.push(itemMatch[1].trim().replace(/^["']|["']$/g, ""));
      index = i;
      continue;
    }

    if (/^\s*$/.test(line)) {
      index = i;
      continue;
    }

    index = i - 1;
    break;
  }

  return { items, index };
}

function parseIssueFile(repoRoot, absolutePath) {
  const content = fs.readFileSync(absolutePath, "utf8");
  const frontMatterInfo = getFrontMatterRange(content);
  const frontMatterLines = frontMatterInfo.raw.replace(/\r/g, "").split("\n");
  const parsed = {
    blocked_by: [],
  };

  for (let i = 0; i < frontMatterLines.length; i += 1) {
    const line = frontMatterLines[i];
    if (/^\s*$/.test(line)) {
      continue;
    }

    if (/^\s*blocked_by:\s*(.*)$/.test(line)) {
      const { items, index } = parseBlockedByValue(frontMatterLines, i);
      parsed.blocked_by = items;
      i = index;
      continue;
    }

    const keyValueMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (keyValueMatch) {
      parsed[keyValueMatch[1]] = keyValueMatch[2].trim().replace(/^["']|["']$/g, "");
    }
  }

  const repoRelativePath = getRelativeRepoPath(repoRoot, absolutePath);
  const pathMatch = repoRelativePath.match(/^\.scratch\/([^/]+)\/issues\/([^/]+)\.md$/);
  const featureSlug = pathMatch ? pathMatch[1] : null;
  const issueStem = pathMatch ? pathMatch[2] : path.basename(absolutePath, ".md");

  return {
    AbsolutePath: absolutePath,
    RepoRelativePath: repoRelativePath,
    Content: content,
    FrontMatter: parsed,
    FeatureSlug: featureSlug,
    IssueStem: issueStem,
    IssueId: featureSlug ? `${featureSlug}-${issueStem}` : issueStem,
  };
}

function getLatestAgentBriefSection(content) {
  const headingRegex = /^## Agent Brief\s*$/gm;
  const matches = [...content.matchAll(headingRegex)];
  if (matches.length === 0) {
    return null;
  }

  const start = matches[matches.length - 1].index;
  const remaining = content.slice(start);
  const nextHeadings = [...remaining.matchAll(/^## .+$/gm)];
  if (nextHeadings.length > 1) {
    return remaining.slice(0, nextHeadings[1].index).trim();
  }

  return remaining.trim();
}

function testAgentBriefValid(content) {
  const brief = getLatestAgentBriefSection(content);
  if (!brief) {
    return false;
  }

  for (const marker of [
    "**Current behavior:**",
    "**Desired behavior:**",
    "**Key interfaces:**",
    "**Acceptance criteria:**",
    "**Out of scope:**",
  ]) {
    if (!brief.includes(marker)) {
      return false;
    }
  }

  return true;
}

function setIssueStatus(absolutePath, newStatus) {
  const content = fs.readFileSync(absolutePath, "utf8");
  const updated = content.replace(/^status:\s*.*$/m, `status: ${newStatus}`);
  if (updated === content) {
    throw new Error(`Unable to update status in ${absolutePath}.`);
  }

  fs.writeFileSync(absolutePath, updated, "utf8");
}

function testIssueValidForAgent(issue, repoRoot) {
  const errors = [];

  if (issue.FrontMatter.type !== "Issue") {
    errors.push("Missing or invalid type: expected type: Issue.");
  }

  if (!issue.FrontMatter.category || issue.FrontMatter.category.trim() === "") {
    errors.push("Missing category.");
  } else if (!["bug", "enhancement"].includes(issue.FrontMatter.category)) {
    errors.push("Invalid category value.");
  }

  if (!Object.hasOwn(issue.FrontMatter, "blocked_by")) {
    errors.push("Missing blocked_by field.");
  } else {
    for (const blocker of issue.FrontMatter.blocked_by) {
      if (!/^\.scratch\/.+\/issues\/.+\.md$/.test(blocker)) {
        errors.push(`Invalid blocker reference format: ${blocker}`);
        continue;
      }

      const blockerAbsolute = resolveRepoPath(repoRoot, blocker);
      if (!fs.existsSync(blockerAbsolute)) {
        errors.push(`Missing blocker issue file: ${blocker}`);
      }
    }
  }

  if (!testAgentBriefValid(issue.Content)) {
    errors.push("Missing or invalid ## Agent Brief.");
  }

  return errors;
}

function listIssueFiles(rootPath) {
  const files = [];

  function visit(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (entry.isFile() && absolutePath.endsWith(".md") && /[\\/]issues[\\/].+\.md$/.test(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  visit(rootPath);
  return files;
}

function getIssueCatalog(repoRoot, statusMapping) {
  const issueRoot = path.join(repoRoot, ".scratch");
  if (!fs.existsSync(issueRoot)) {
    return {
      Eligible: [],
      InvalidReady: [],
      BlockedReady: [],
      InProgress: [],
      ReadyForHuman: [],
    };
  }

  const parsedIssues = new Map();
  for (const filePath of listIssueFiles(issueRoot)) {
    const issue = parseIssueFile(repoRoot, filePath);
    parsedIssues.set(issue.RepoRelativePath, issue);
  }

  const eligible = [];
  const invalidReady = [];
  const blockedReady = [];
  const inProgress = [];
  const readyForHuman = [];

  for (const issue of [...parsedIssues.values()].sort((a, b) => a.RepoRelativePath.localeCompare(b.RepoRelativePath))) {
    const status = issue.FrontMatter.status;
    if (status === statusMapping["in-progress"]) {
      inProgress.push(issue);
      continue;
    }

    if (status === statusMapping["ready-for-human"]) {
      readyForHuman.push(issue);
      continue;
    }

    if (status !== statusMapping["ready-for-agent"]) {
      continue;
    }

    const errors = testIssueValidForAgent(issue, repoRoot);
    if (errors.length > 0) {
      invalidReady.push({
        Issue: issue,
        Errors: errors,
      });
      continue;
    }

    const unresolved = [];
    for (const blocker of issue.FrontMatter.blocked_by) {
      const blockerIssue = parsedIssues.get(blocker);
      if (!blockerIssue) {
        errors.push(`Missing blocker issue file: ${blocker}`);
        continue;
      }

      if (blockerIssue.FrontMatter.status !== statusMapping.done) {
        unresolved.push(blocker);
      }
    }

    if (errors.length > 0) {
      invalidReady.push({
        Issue: issue,
        Errors: errors,
      });
      continue;
    }

    if (unresolved.length > 0) {
      blockedReady.push({
        Issue: issue,
        UnresolvedBlockers: unresolved,
      });
      continue;
    }

    eligible.push(issue);
  }

  return {
    Eligible: eligible,
    InvalidReady: invalidReady,
    BlockedReady: blockedReady,
    InProgress: inProgress,
    ReadyForHuman: readyForHuman,
  };
}

function getCurrentBranchName(repoRoot) {
  return invokeGit(repoRoot, ["branch", "--show-current"])[0];
}

function getGitStatusPorcelain(repoRoot) {
  return invokeGit(repoRoot, ["status", "--porcelain"]).filter((line) => line.trim() !== "");
}

function getIssueArtifacts(repoRoot, issue) {
  const branchName = `agent/${issue.FeatureSlug}-${issue.IssueStem}`;
  const worktreeName = `agent-${issue.FeatureSlug}-${issue.IssueStem}`;
  const worktreePath = path.join(repoRoot, ".worktrees", worktreeName);
  const reportRelativePath = `.agents/issue-manager/reports/${issue.FeatureSlug}-${issue.IssueStem}.md`;
  const reportAbsolutePath = resolveRepoPath(worktreePath, reportRelativePath);

  return {
    BranchName: branchName,
    WorktreeName: worktreeName,
    WorktreePath: worktreePath,
    ReportRelativePath: reportRelativePath,
    ReportAbsolutePath: reportAbsolutePath,
  };
}

function getManagedWorktreeState(worktreePath) {
  if (!fs.existsSync(worktreePath)) {
    return null;
  }

  const status = tryInvokeGit(worktreePath, ["status", "--porcelain"]);
  const branch = tryInvokeGit(worktreePath, ["branch", "--show-current"]);
  const head = tryInvokeGit(worktreePath, ["rev-parse", "HEAD"]);

  return {
    StatusOk: status.Success,
    StatusOutput: status.Output.filter((line) => line.trim() !== ""),
    BranchOk: branch.Success,
    BranchName: branch.Success ? branch.Output[0] : null,
    HeadOk: head.Success,
    Head: head.Success ? head.Output[0] : null,
  };
}

function getManualRecoverySteps(managedBranches, managedWorktrees, inProgressIssues) {
  const steps = [];

  for (const branch of managedBranches) {
    steps.push(`Inspect branch ${branch} and delete it manually when safe: git branch -D ${branch}`);
  }

  for (const worktree of managedWorktrees) {
    steps.push(`Inspect worktree ${worktree} and remove it manually when safe: git worktree remove --force "${worktree}"`);
  }

  for (const issue of inProgressIssues) {
    steps.push(
      `Review issue ${issue.RepoRelativePath} and decide whether to keep it in-progress or move it back to ready-for-agent manually.`,
    );
  }

  return steps;
}

function newPreflightSummary(repoRoot, statusMapping) {
  const catalog = getIssueCatalog(repoRoot, statusMapping);
  const managedBranches = getManagedBranchNames(repoRoot);
  const managedWorktrees = getManagedWorktreeDirectories(repoRoot);
  const completedLeftovers = [];

  for (const branch of managedBranches) {
    const branchMatch = branch.match(/^agent\/(.+)$/);
    if (!branchMatch) {
      continue;
    }

    const suffix = branchMatch[1];
    const worktreePath = path.join(repoRoot, ".worktrees", `agent-${suffix}`);
    if (!fs.existsSync(worktreePath)) {
      continue;
    }

    const state = getManagedWorktreeState(worktreePath);
    if (!state || !state.StatusOk || state.StatusOutput.length !== 0) {
      continue;
    }

    const issueMatch = suffix.match(/^(.+)-([0-9]{2}-.+)$/);
    if (!issueMatch) {
      continue;
    }

    const issueRelative = `.scratch/${issueMatch[1]}/issues/${issueMatch[2]}.md`;
    const issueAbsolute = resolveRepoPath(worktreePath, issueRelative);
    if (!fs.existsSync(issueAbsolute)) {
      continue;
    }

    const issue = parseIssueFile(worktreePath, issueAbsolute);
    if (issue.FrontMatter.status === statusMapping.done) {
      completedLeftovers.push({
        Branch: branch,
        WorktreePath: worktreePath,
        IssuePath: issueRelative,
      });
    }
  }

  return {
    Eligible: catalog.Eligible,
    InvalidReady: catalog.InvalidReady,
    BlockedReady: catalog.BlockedReady,
    InProgress: catalog.InProgress,
    ReadyForHuman: catalog.ReadyForHuman,
    ManagedBranches: managedBranches,
    ManagedWorktrees: managedWorktrees,
    CompletedLeftovers: completedLeftovers,
  };
}

function invokeRun(repoRoot) {
  const prereqs = getPrerequisitesOrBlocked(repoRoot);
  if (!prereqs.Ok) {
    exitJson(prereqs.Payload);
  }

  const statusMapping = prereqs.StatusMapping;
  const preflight = newPreflightSummary(repoRoot, statusMapping);
  const dirty = getGitStatusPorcelain(repoRoot);

  if (dirty.length > 0) {
    exitJson({
      status: "blocked",
      phase: "preflight",
      reasonCode: "dirty-repo",
      message: "The repository is dirty. Commit, stash, or discard changes before running issue-manager.",
      dirtyFiles: dirty,
      preflight: {
        eligibleCount: preflight.Eligible.length,
        blockedCount: preflight.BlockedReady.length,
        invalidCount: preflight.InvalidReady.length,
        inProgressCount: preflight.InProgress.length,
        readyForHumanCount: preflight.ReadyForHuman.length,
      },
    });
  }

  if (preflight.ManagedBranches.length > 0) {
    exitJson({
      status: "blocked",
      phase: "preflight",
      reasonCode: "managed-branch-exists",
      message: "Managed worker branches already exist. Resolve them before starting a new run.",
      managedBranches: preflight.ManagedBranches,
      manualRecovery: getManualRecoverySteps(
        preflight.ManagedBranches,
        preflight.ManagedWorktrees,
        preflight.InProgress,
      ),
    });
  }

  if (preflight.ManagedWorktrees.length > 0) {
    exitJson({
      status: "blocked",
      phase: "preflight",
      reasonCode: "managed-worktree-exists",
      message: "Managed worker worktrees already exist. Resolve them before starting a new run.",
      managedWorktrees: preflight.ManagedWorktrees,
      manualRecovery: getManualRecoverySteps(
        preflight.ManagedBranches,
        preflight.ManagedWorktrees,
        preflight.InProgress,
      ),
    });
  }

  if (preflight.Eligible.length === 0) {
    exitJson({
      status: "idle",
      message: "No eligible ready-for-agent issues remain.",
      preflight: {
        eligibleCount: 0,
        blockedCount: preflight.BlockedReady.length,
        invalidCount: preflight.InvalidReady.length,
        inProgressCount: preflight.InProgress.length,
        readyForHumanCount: preflight.ReadyForHuman.length,
      },
      blockedIssues: preflight.BlockedReady.map((item) => ({
        issuePath: item.Issue.RepoRelativePath,
        blockers: item.UnresolvedBlockers,
      })),
      invalidIssues: preflight.InvalidReady.map((item) => ({
        issuePath: item.Issue.RepoRelativePath,
        errors: item.Errors,
      })),
      inProgressIssues: preflight.InProgress.map((issue) => issue.RepoRelativePath),
      readyForHumanIssues: preflight.ReadyForHuman.map((issue) => issue.RepoRelativePath),
    });
  }

  const issue = preflight.Eligible[0];
  const integrationBranch = getCurrentBranchName(repoRoot);
  const artifacts = getIssueArtifacts(repoRoot, issue);

  try {
    setIssueStatus(issue.AbsolutePath, statusMapping["in-progress"]);
    invokeGit(repoRoot, ["add", "--", issue.RepoRelativePath]);
    invokeGit(repoRoot, ["commit", "-m", `chore(issue-manager): claim ${issue.IssueId}`]);
  } catch (error) {
    exitJson({
      status: "blocked",
      phase: "claim",
      reasonCode: "claim-failed",
      message: error.message,
      issuePath: issue.RepoRelativePath,
    });
  }

  let prepareStep = "create branch";
  try {
    invokeGit(repoRoot, ["branch", artifacts.BranchName, "HEAD"]);

    prepareStep = "create worktree root";
    const worktreeRoot = path.dirname(artifacts.WorktreePath);
    if (!fs.existsSync(worktreeRoot)) {
      fs.mkdirSync(worktreeRoot, { recursive: true });
    }

    prepareStep = "add worktree";
    invokeGit(repoRoot, ["worktree", "add", artifacts.WorktreePath, artifacts.BranchName]);

    prepareStep = "verify checked out branch";
    const checkedOutBranch = invokeGit(artifacts.WorktreePath, ["branch", "--show-current"])[0];
    if (checkedOutBranch !== artifacts.BranchName) {
      throw new Error(`Worker worktree is on ${checkedOutBranch} instead of ${artifacts.BranchName}.`);
    }

    prepareStep = "create report directory";
    const reportDir = path.dirname(artifacts.ReportAbsolutePath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
  } catch (error) {
    exitJson({
      status: "blocked",
      phase: "prepare-worker",
      reasonCode: "prepare-worker-failed",
      message: `${prepareStep} failed: ${error.message}`,
      issuePath: issue.RepoRelativePath,
      workerBranch: artifacts.BranchName,
      worktreePath: artifacts.WorktreePath,
    });
  }

  exitJson({
    status: "claimed",
    issuePath: issue.RepoRelativePath,
    issueId: issue.IssueId,
    featureSlug: issue.FeatureSlug,
    issueStem: issue.IssueStem,
    integrationBranch,
    workerBranch: artifacts.BranchName,
    worktreePath: artifacts.WorktreePath,
    reportPath: artifacts.ReportAbsolutePath,
    reportRelativePath: artifacts.ReportRelativePath,
    preflight: {
      eligibleCount: preflight.Eligible.length,
      blockedCount: preflight.BlockedReady.length,
      invalidCount: preflight.InvalidReady.length,
      inProgressCount: preflight.InProgress.length,
      readyForHumanCount: preflight.ReadyForHuman.length,
    },
  });
}

function invokeComplete(repoRoot, issuePath) {
  if (!issuePath || issuePath.trim() === "") {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "missing-issue-path",
      message: "complete requires the claimed issue path.",
    });
  }

  const prereqs = getPrerequisitesOrBlocked(repoRoot);
  if (!prereqs.Ok) {
    exitJson(prereqs.Payload);
  }

  const statusMapping = prereqs.StatusMapping;
  const managedBranches = getManagedBranchNames(repoRoot);
  const managedWorktrees = getManagedWorktreeDirectories(repoRoot);

  if (managedBranches.length !== 1 || managedWorktrees.length !== 1) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "inconsistent-managed-artifacts",
      message: "complete requires exactly one managed branch and one managed worktree.",
      managedBranches,
      managedWorktrees,
    });
  }

  const branchName = managedBranches[0];
  const worktreePath = managedWorktrees[0];
  const branchSuffix = branchName.match(/^agent\/(.+)$/);
  const worktreeSuffix = path.basename(worktreePath).match(/^agent-(.+)$/);
  if (!branchSuffix || !worktreeSuffix || branchSuffix[1] !== worktreeSuffix[1]) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "managed-artifact-mismatch",
      message: "Managed branch and worktree do not map to the same issue id.",
      workerBranch: branchName,
      worktreePath,
    });
  }

  const activeIssueId = branchSuffix[1];
  const issueMatch = activeIssueId.match(/^(.+)-([0-9]{2}-.+)$/);
  if (!issueMatch) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "invalid-managed-issue-id",
      message: `Managed branch ${branchName} does not map to <feature-slug>-<issue-stem>.`,
    });
  }

  const expectedIssuePath = `.scratch/${issueMatch[1]}/issues/${issueMatch[2]}.md`;
  if (issuePath !== expectedIssuePath) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "claimed-issue-mismatch",
      message: "complete was asked to finish a different issue than the active managed worker.",
      expectedIssuePath,
      actualIssuePath: issuePath,
    });
  }

  const state = getManagedWorktreeState(worktreePath);
  if (!state || !state.StatusOk || !state.BranchOk || !state.HeadOk) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "unreadable-worker-state",
      message: "Could not read worker worktree state.",
      workerBranch: branchName,
      worktreePath,
    });
  }

  if (state.BranchName !== branchName) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "worker-on-wrong-branch",
      message: "Worker worktree is not checked out on the expected managed branch.",
      workerBranch: branchName,
      actualBranch: state.BranchName,
      worktreePath,
    });
  }

  const branchHead = invokeGit(repoRoot, ["rev-parse", branchName])[0];
  if (branchHead !== state.Head) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "worker-head-mismatch",
      message: "Worker branch tip does not match the checked-out worktree HEAD.",
      workerBranch: branchName,
      worktreePath,
    });
  }

  if (state.StatusOutput.length > 0) {
    exitJson({
      status: "blocked",
      phase: "worker",
      reasonCode: "worker-dirty",
      message: "Worker left a dirty worktree.",
      workerBranch: branchName,
      worktreePath,
      gitStatus: state.StatusOutput,
    });
  }

  const issueAbsolute = resolveRepoPath(worktreePath, issuePath);
  if (!fs.existsSync(issueAbsolute)) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "missing-issue-file",
      message: "Assigned issue file is missing from the worker worktree.",
      issuePath,
      workerBranch: branchName,
    });
  }

  const issue = parseIssueFile(worktreePath, issueAbsolute);
  if (issue.FrontMatter.status !== statusMapping.done) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "issue-not-done",
      message: "Assigned issue is not marked done in the worker worktree.",
      issuePath,
      workerBranch: branchName,
      actualStatus: issue.FrontMatter.status,
    });
  }

  const reportPath = resolveRepoPath(worktreePath, `.agents/issue-manager/reports/${activeIssueId}.md`);
  if (!fs.existsSync(reportPath)) {
    exitJson({
      status: "blocked",
      phase: "complete",
      reasonCode: "missing-report",
      message: "Required worker completion report is missing.",
      workerBranch: branchName,
      reportPath,
    });
  }

  try {
    invokeGit(repoRoot, [
      "merge",
      "--no-ff",
      "--no-edit",
      "-m",
      `merge(issue-manager): ${activeIssueId}`,
      branchName,
    ]);
  } catch (error) {
    const mergeStatus = tryInvokeGit(repoRoot, ["status", "--porcelain"]);
    const mergeText = `${error.message}\n${mergeStatus.Output.join("\n")}`;
    const reasonCode = /CONFLICT|Automatic merge failed|^UU\s/m.test(mergeText)
      ? "merge-conflict"
      : "merge-failed";

    exitJson({
      status: "blocked",
      phase: "merge",
      reasonCode,
      message: error.message,
      issuePath,
      workerBranch: branchName,
      worktreePath,
    });
  }

  try {
    invokeGit(repoRoot, ["worktree", "remove", "--force", worktreePath]);
    invokeGit(repoRoot, ["branch", "-D", branchName]);
  } catch (error) {
    exitJson({
      status: "blocked",
      phase: "merge",
      reasonCode: "post-merge-cleanup-failed",
      message: error.message,
      issuePath,
      workerBranch: branchName,
      worktreePath,
    });
  }

  exitJson({
    status: "merged",
    issuePath,
    issueId: activeIssueId,
    workerBranch: branchName,
    mergeCommitMessage: `merge(issue-manager): ${activeIssueId}`,
  });
}

function invokeInspectionCommand(repoRoot, commandName) {
  const prereqs = getPrerequisitesOrBlocked(repoRoot);
  if (!prereqs.Ok) {
    exitJson(prereqs.Payload);
  }

  const statusMapping = prereqs.StatusMapping;
  const preflight = newPreflightSummary(repoRoot, statusMapping);
  const manualRecovery = getManualRecoverySteps(
    preflight.ManagedBranches,
    preflight.ManagedWorktrees,
    preflight.InProgress,
  );

  exitJson({
    status: commandName,
    message: "Issue-manager inspection summary.",
    eligibleIssues: preflight.Eligible.map((issue) => issue.RepoRelativePath),
    blockedReadyIssues: preflight.BlockedReady.map((item) => ({
      issuePath: item.Issue.RepoRelativePath,
      blockers: item.UnresolvedBlockers,
    })),
    invalidReadyIssues: preflight.InvalidReady.map((item) => ({
      issuePath: item.Issue.RepoRelativePath,
      errors: item.Errors,
    })),
    inProgressIssues: preflight.InProgress.map((issue) => issue.RepoRelativePath),
    readyForHumanIssues: preflight.ReadyForHuman.map((issue) => issue.RepoRelativePath),
    managedBranches: preflight.ManagedBranches,
    managedWorktrees: preflight.ManagedWorktrees,
    completedNotMerged: preflight.CompletedLeftovers,
    manualRecovery,
  });
}

function parseCliArgs(argv) {
  let command = "run";
  let issuePath;
  let commandSet = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!commandSet && COMMANDS.has(arg)) {
      command = arg;
      commandSet = true;
      continue;
    }

    if (arg === "-IssuePath" || arg === "--issue-path" || arg === "--issuePath") {
      issuePath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--issue-path=") || arg.startsWith("--issuePath=")) {
      issuePath = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { command, issuePath };
}

try {
  const { command, issuePath } = parseCliArgs(process.argv.slice(2));
  const repoRoot = getRepoTopLevel();
  assertRepoRootContext(repoRoot);

  switch (command) {
    case "run":
      invokeRun(repoRoot);
      break;
    case "complete":
      invokeComplete(repoRoot, issuePath);
      break;
    case "status":
    case "cleanup":
      invokeInspectionCommand(repoRoot, command);
      break;
    default:
      failInvocation(`Unknown command: ${command}`);
  }
} catch (error) {
  failInvocation(error.message);
}
