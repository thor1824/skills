const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { main } = require("./orchestrate-prd.js");

function run(command, args, cwd) {
  const result = childProcess.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeTriageLabels(repoRoot, statuses = {}) {
  const mapping = {
    "needs-triage": statuses.needsTriage || "needs-triage",
    "needs-info": statuses.needsInfo || "needs-info",
    "ready-for-agent": statuses.readyForAgent || "ready-for-agent",
    "ready-for-human": statuses.readyForHuman || "ready-for-human",
    "in-progress": statuses.inProgress || "in-progress",
    "done": statuses.done || "done",
    "wontfix": statuses.wontfix || "wontfix",
  };

  writeFile(
    path.join(repoRoot, "docs", "agents", "triage-labels.md"),
    `# Issue Statuses\n\n` +
      `| Canonical state | \`status\` value in our tracker | Meaning |\n` +
      `| --- | --- | --- |\n` +
      Object.entries(mapping)
        .map(([canonical, tracker]) => `| \`${canonical}\` | \`${tracker}\` | test |\n`)
        .join(""),
  );
}

function withCapturedConsole(fn) {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (value) => logs.push(String(value));
  console.error = (value) => errors.push(String(value));
  try {
    const exitCode = fn();
    return { errors, exitCode, logs };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function runMain(args, cwd) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const result = withCapturedConsole(() => main(args));
    const stdout = result.logs.join("\n").trim();
    return {
      ...result,
      json: stdout ? JSON.parse(stdout) : null,
      stderr: result.errors.join("\n").trim(),
    };
  } finally {
    process.chdir(previous);
  }
}

function setupRepo(name) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  run("git", ["init"], repoRoot);
  run("git", ["config", "user.name", "Codex Tests"], repoRoot);
  run("git", ["config", "user.email", "codex-tests@example.com"], repoRoot);
  writeFile(path.join(repoRoot, "README.md"), "# test\n");
  writeTriageLabels(repoRoot);
  run("git", ["add", "."], repoRoot);
  run("git", ["commit", "-m", "init"], repoRoot);
  return repoRoot;
}

function uniqueTempPath(name) {
  return path.join(os.tmpdir(), `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function issueTemplate(status, extraFrontmatter = "", body = "") {
  return `---\n` +
    `type: Issue\n` +
    `status: ${status}\n` +
    `category: enhancement\n` +
    `blocked_by: []\n` +
    `${extraFrontmatter}` +
    `---\n\n${body}`;
}

test("write-report materializes valid captured output into the worktree", () => {
  const repoRoot = setupRepo("orchestrate-prd-write-report");
  const issuePath = path.join(repoRoot, ".scratch", "demo", "issues", "01-login-rate-limit.md");
  const worktreePath = uniqueTempPath("demo-worktree");
  fs.mkdirSync(worktreePath, { recursive: true });

  writeFile(
    issuePath,
    issueTemplate(
      "in-progress",
      `branch: issue/login-rate-limit\nworktree_path: ${JSON.stringify(worktreePath)}\n`,
      "## Agent Brief\n\n## Acceptance Criteria\n- [ ] Add rate limiting\n",
    ),
  );
  const outputPath = path.join(repoRoot, "captured-report.md");
  writeFile(
    outputPath,
    "## Result\nPASS\n\n## Acceptance Criteria\n- [x] Add rate limiting - verified\n\n## Verification Gaps\n- None\n",
  );

  const result = runMain(
    [
      "write-report",
      "--issue",
      path.relative(repoRoot, issuePath),
      "--output-file",
      path.relative(repoRoot, outputPath),
      "--pretty",
    ],
    repoRoot,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.json.status, "REPORT_WRITTEN");
  const reportPath = path.join(worktreePath, ".codex", "orchestrate-prd", "report.md");
  assert.equal(readFile(reportPath).includes("## Result"), true);
});

test("merge-worktree marks FAIL reports as ready-for-human", () => {
  const repoRoot = setupRepo("orchestrate-prd-merge-fail");
  const worktreePath = uniqueTempPath("demo-worktree-fail");
  run("git", ["worktree", "add", "-b", "issue/demo", worktreePath, "HEAD"], repoRoot);

  const issuePath = path.join(repoRoot, ".scratch", "demo", "issues", "01-login-rate-limit.md");
  writeFile(
    issuePath,
    issueTemplate(
      "in-progress",
      `branch: issue/demo\nworktree_path: ${JSON.stringify(worktreePath)}\n`,
      "## Agent Brief\n\n## Acceptance Criteria\n- [ ] Add rate limiting\n",
    ),
  );
  const reportPath = path.join(worktreePath, ".codex", "orchestrate-prd", "report.md");
  writeFile(
    reportPath,
    "## Result\nFAIL\n\n## Acceptance Criteria\n- [ ] Add rate limiting - failed\n\n## Verification Gaps\n- Missing implementation\n",
  );

  const result = runMain(
    [
      "merge-worktree",
      "--issue",
      path.relative(repoRoot, issuePath),
      "--report",
      ".codex/orchestrate-prd/report.md",
      "--pretty",
    ],
    repoRoot,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.json.status, "FAILED");
  assert.match(readFile(issuePath), /status: ready-for-human/);
});

test("find-ready and review-prd respect repo-specific status mappings", () => {
  const repoRoot = setupRepo("orchestrate-prd-status-mapping");
  writeTriageLabels(repoRoot, {
    done: "closed",
    inProgress: "active",
    needsInfo: "waiting-on-reporter",
    readyForAgent: "queued-for-agent",
    readyForHuman: "waiting-on-human",
    wontfix: "declined",
  });

  const prdPath = path.join(repoRoot, ".scratch", "demo", "PRD.md");
  const issueReadyPath = path.join(repoRoot, ".scratch", "demo", "issues", "01-login-rate-limit.md");
  const issueDonePath = path.join(repoRoot, ".scratch", "demo", "issues", "02-audit-export.md");
  const issueWontfixPath = path.join(repoRoot, ".scratch", "demo", "issues", "03-session-copy.md");

  writeFile(
    prdPath,
    `---\n` +
      `type: PRD\n` +
      `status: waiting-on-human\n` +
      `category: enhancement\n` +
      `blocked_by: []\n` +
      `---\n\n` +
      `## User Stories\n\n` +
      `1. As an operator, I want login rate limiting, so that brute force attempts are reduced\n` +
      `2. As an auditor, I want an audit trail export, so that I can review access history\n` +
      `3. As a support agent, I want session copy text, so that I can reuse canned responses\n`,
  );
  writeFile(
    issueReadyPath,
    issueTemplate(
      "queued-for-agent",
      "",
      "## Agent Brief\n\n## Acceptance Criteria\n- [ ] Add rate limiting\n",
    ),
  );
  writeFile(
    issueDonePath,
    issueTemplate(
      "closed",
      "",
      "## User stories covered\n\n1. PRD story 2 - Ship audit export.\n",
    ),
  );
  writeFile(
    issueWontfixPath,
    issueTemplate(
      "declined",
      "",
      "## User stories covered\n\n1. PRD story 3 - Reject the session copy work.\n",
    ),
  );

  const ready = runMain(["find-ready", "--prd", path.relative(repoRoot, prdPath), "--pretty"], repoRoot);
  assert.equal(ready.exitCode, 0);
  assert.equal(ready.json.ready_status, "queued-for-agent");
  assert.equal(ready.json.ready.length, 1);
  assert.match(ready.json.ready[0].path, /01-login-rate-limit\.md$/);

  const review = runMain(["review-prd", "--prd", path.relative(repoRoot, prdPath), "--pretty"], repoRoot);
  assert.equal(review.exitCode, 1);
  assert.equal(review.json.done[0].status, "closed");
  assert.equal(review.json.wontfix[0].status, "declined");
  assert.equal(review.json.coverage_summary.explicit, 2);
  assert.equal(review.json.legacy_fallback_used, false);
  assert.match(review.json.uncovered[0].story, /login rate limiting/i);
});

test("review-prd reports uncovered user stories", () => {
  const repoRoot = setupRepo("orchestrate-prd-review-gap");
  const prdPath = path.join(repoRoot, ".scratch", "demo", "PRD.md");
  const issuePath = path.join(repoRoot, ".scratch", "demo", "issues", "01-login-rate-limit.md");

  writeFile(
    prdPath,
    `---\n` +
      `type: PRD\n` +
      `status: ready-for-human\n` +
      `category: enhancement\n` +
      `blocked_by: []\n` +
      `---\n\n` +
      `## User Stories\n\n` +
      `1. As an operator, I want login rate limiting, so that brute force attempts are reduced\n` +
      `2. As an auditor, I want an audit trail export, so that I can review access history\n`,
  );
  writeFile(
    issuePath,
    issueTemplate(
      "done",
      "",
      "## What to build\n\nImplement login rate limiting for operators.\n",
    ),
  );

  const result = runMain(["review-prd", "--prd", path.relative(repoRoot, prdPath), "--pretty"], repoRoot);

  assert.equal(result.exitCode, 1);
  assert.equal(result.json.review_status, "COVERAGE_GAPS");
  assert.equal(result.json.uncovered.length, 1);
  assert.equal(result.json.covered[0].coverage_source, "legacy-inferred");
  assert.equal(result.json.legacy_fallback_used, true);
  assert.match(result.json.uncovered[0].story, /audit trail export/i);
});

test("review-prd prefers explicit story references over legacy inference", () => {
  const repoRoot = setupRepo("orchestrate-prd-review-explicit");
  const prdPath = path.join(repoRoot, ".scratch", "demo", "PRD.md");
  const issuePath = path.join(repoRoot, ".scratch", "demo", "issues", "01-login-rate-limit.md");

  writeFile(
    prdPath,
    `---\n` +
      `type: PRD\n` +
      `status: ready-for-human\n` +
      `category: enhancement\n` +
      `blocked_by: []\n` +
      `---\n\n` +
      `## User Stories\n\n` +
      `1. As an operator, I want login rate limiting, so that brute force attempts are reduced\n`,
  );
  writeFile(
    issuePath,
    issueTemplate(
      "done",
      "",
      "## User stories covered\n\n1. PRD story 1 - Implement login rate limiting.\n",
    ),
  );

  const result = runMain(["review-prd", "--prd", path.relative(repoRoot, prdPath), "--pretty"], repoRoot);

  assert.equal(result.exitCode, 0);
  assert.equal(result.json.review_status, "PASS");
  assert.equal(result.json.covered[0].coverage_source, "explicit");
  assert.equal(result.json.coverage_summary.explicit, 1);
  assert.equal(result.json.legacy_fallback_used, false);
});

test("mark-done marks the PRD done only after coverage review passes", () => {
  const repoRoot = setupRepo("orchestrate-prd-mark-done");
  const prdPath = path.join(repoRoot, ".scratch", "demo", "PRD.md");
  const issueAPath = path.join(repoRoot, ".scratch", "demo", "issues", "01-login-rate-limit.md");
  const issueBPath = path.join(repoRoot, ".scratch", "demo", "issues", "02-audit-trail-export.md");

  writeFile(
    prdPath,
    `---\n` +
      `type: PRD\n` +
      `status: ready-for-human\n` +
      `category: enhancement\n` +
      `blocked_by: []\n` +
      `---\n\n` +
      `## User Stories\n\n` +
      `1. As an operator, I want login rate limiting, so that brute force attempts are reduced\n` +
      `2. As an auditor, I want audit trail export, so that I can review access history\n`,
  );
  writeFile(
    issueAPath,
    issueTemplate("done", "", "## User stories covered\n\n1. PRD story 1 - Ship operator login rate limiting.\n"),
  );
  writeFile(
    issueBPath,
    issueTemplate("done", "", "## User stories covered\n\n1. PRD story 2 - Ship auditor audit trail export.\n"),
  );

  const result = runMain(["mark-done", "--prd", path.relative(repoRoot, prdPath), "--pretty"], repoRoot);

  assert.equal(result.exitCode, 0);
  assert.equal(result.json.status, "DONE");
  assert.match(readFile(prdPath), /status: done/);
  assert.match(readFile(prdPath), /Coverage source: explicit 2, legacy-inferred 0/);
});

test("find-ready fails clearly when triage status mapping is missing", () => {
  const repoRoot = setupRepo("orchestrate-prd-missing-mapping");
  fs.rmSync(path.join(repoRoot, "docs"), { recursive: true, force: true });

  const prdPath = path.join(repoRoot, ".scratch", "demo", "PRD.md");
  writeFile(
    prdPath,
    `---\n` +
      `type: PRD\n` +
      `status: ready-for-human\n` +
      `category: enhancement\n` +
      `blocked_by: []\n` +
      `---\n`,
  );

  const result = runMain(["find-ready", "--prd", path.relative(repoRoot, prdPath), "--pretty"], repoRoot);

  assert.equal(result.exitCode, 1);
  assert.match(result.json.error, /Run \/prepare-repo/i);
});

test("skill docs reference prepare-repo instead of the old setup skill", () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const processDoc = readFile(path.join(repoRoot, "skills", "PROCESS.md"));
  const triageDoc = readFile(path.join(repoRoot, "skills", "triage", "SKILL.md"));
  const toPrdDoc = readFile(path.join(repoRoot, "skills", "to-prd", "SKILL.md"));
  const toIssuesDoc = readFile(path.join(repoRoot, "skills", "to-issues", "SKILL.md"));

  assert.doesNotMatch(processDoc, /setup-tsda-skills/);
  assert.doesNotMatch(triageDoc, /setup-tsda-skills/);
  assert.doesNotMatch(toPrdDoc, /setup-tsda-skills/);
  assert.doesNotMatch(toIssuesDoc, /setup-tsda-skills/);
  assert.match(processDoc, /prepare-repo/);
});
