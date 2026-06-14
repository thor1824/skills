#!/usr/bin/env node

import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_HASH_LEN = 6;
const STATUS_PROPERTY_TO_CANONICAL = {
  done: "done",
  inProgress: "in-progress",
  needsInfo: "needs-info",
  needsTriage: "needs-triage",
  readyForAgent: "ready-for-agent",
  readyForHuman: "ready-for-human",
  readyForSlicing: "ready-for-slicing",
  wontfix: "wontfix",
};
const REQUIRED_STATUS_PROPERTIES = [
  "done",
  "inProgress",
  "needsInfo",
  "readyForAgent",
  "readyForHuman",
  "wontfix",
];
const DEFAULT_REPORT_PATH = ".codex/orchestrate-prd/report.md";
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "this",
  "to",
  "want",
  "with",
]);
const FRONTMATTER_KEY_ORDER = [
  "type",
  "status",
  "category",
  "blocked_by",
  "branch",
  "worktree_path",
];

class ToolError extends Error {}
class UsageError extends Error {}

function usage() {
  return [
    "Usage:",
    "  node scripts/orchestrate-prd.js find-ready --prd <PRD.md> [--pretty]",
    "  node scripts/orchestrate-prd.js create-worktrees --prd <PRD.md> [--mark-in-progress] [--limit N] [--base REF] [--root DIR] [--dry-run] [--pretty]",
    "  node scripts/orchestrate-prd.js create-worktrees <issue.md>... [--base REF] [--root DIR] [--dry-run] [--pretty]",
    "  node scripts/orchestrate-prd.js merge-worktree --issue <issue.md> --report <report.md> [--verify-command CMD] [--delete-branch] [--pretty]",
    "  node scripts/orchestrate-prd.js write-report --issue <issue.md> [--report <report.md>] (--output TEXT | --output-file <file> | --output-base64 <value>) [--pretty]",
    "  node scripts/orchestrate-prd.js review-prd --prd <PRD.md> [--pretty]",
    "  node scripts/orchestrate-prd.js mark-done --prd <PRD.md> [--pretty]",
    "  node scripts/orchestrate-prd.js mark-done --issue <issue.md> --evidence TEXT [--pretty]",
    "  node scripts/orchestrate-prd.js check-complete --prd <PRD.md> [--pretty]",
  ].join("\n");
}

function commandUsage(command) {
  const lines = {
    "find-ready": [
      "Usage: node scripts/orchestrate-prd.js find-ready --prd <PRD.md> [--pretty]",
      "Legacy: node scripts/orchestrate-prd.js find-ready <folder> [--pretty]",
    ],
    "create-worktrees": [
      "Usage: node scripts/orchestrate-prd.js create-worktrees --prd <PRD.md> [--mark-in-progress] [--limit N] [--base REF] [--root DIR] [--dry-run] [--pretty]",
      "Legacy: node scripts/orchestrate-prd.js create-worktrees <issue.md>... [--base REF] [--root DIR] [--dry-run] [--pretty]",
    ],
    "merge-worktree": [
      "Usage: node scripts/orchestrate-prd.js merge-worktree --issue <issue.md> --report <report.md> [--verify-command CMD] [--delete-branch] [--pretty]",
    ],
    "write-report": [
      "Usage: node scripts/orchestrate-prd.js write-report --issue <issue.md> [--report <report.md>] (--output TEXT | --output-file <file> | --output-base64 <value>) [--pretty]",
    ],
    "review-prd": [
      "Usage: node scripts/orchestrate-prd.js review-prd --prd <PRD.md> [--pretty]",
    ],
    "mark-done": [
      "Usage: node scripts/orchestrate-prd.js mark-done --prd <PRD.md> [--pretty]",
      "Usage: node scripts/orchestrate-prd.js mark-done --issue <issue.md> --evidence TEXT [--pretty]",
    ],
    "check-complete": [
      "Usage: node scripts/orchestrate-prd.js check-complete --prd <PRD.md> [--pretty]",
    ],
  };

  return (lines[command] || [usage()]).join("\n");
}

function emit(result, pretty) {
  console.log(JSON.stringify(result, null, pretty ? 2 : 0));
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== String(value)) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

function normalizePathKey(value) {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function normalizeRelativeKey(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function toDisplayPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function repoRelativePath(repoRoot, filePath) {
  const resolvedRepo = path.resolve(repoRoot);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedRepo, resolvedFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ToolError(`path is outside repo: ${resolvedFile}`);
  }
  return relative.replace(/\\/g, "/");
}

function resolveRepoDocPath(anchorPath) {
  let current = path.resolve(anchorPath);
  if (fs.existsSync(current) && fs.statSync(current).isFile()) {
    current = path.dirname(current);
  }

  while (true) {
    const candidate = path.join(current, "docs", "agents", "triage-labels.md");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function parseStatusMappingTable(text) {
  const mapping = {};

  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue;
    }

    const canonical = cells[0].replace(/`/g, "").trim();
    const trackerValue = cells[1].replace(/`/g, "").trim();
    if (!canonical || canonical.toLowerCase() === "canonical state" || !trackerValue) {
      continue;
    }

    mapping[canonical] = trackerValue;
  }

  return mapping;
}

function loadMappedStatuses(anchorPath) {
  const mappingPath = resolveRepoDocPath(anchorPath);
  if (!mappingPath) {
    throw new ToolError(
      "triage status mapping not found at docs/agents/triage-labels.md. Run /prepare-repo to bootstrap repo-specific tracker docs.",
    );
  }

  const rawMapping = parseStatusMappingTable(fs.readFileSync(mappingPath, "utf8"));
  if (
    !rawMapping[STATUS_PROPERTY_TO_CANONICAL.readyForSlicing] &&
    rawMapping[STATUS_PROPERTY_TO_CANONICAL.readyForHuman]
  ) {
    rawMapping[STATUS_PROPERTY_TO_CANONICAL.readyForSlicing] =
      rawMapping[STATUS_PROPERTY_TO_CANONICAL.readyForHuman];
  }

  const missing = REQUIRED_STATUS_PROPERTIES.filter(
    (property) => !rawMapping[STATUS_PROPERTY_TO_CANONICAL[property]],
  );
  if (missing.length > 0) {
    throw new ToolError(
      `triage status mapping in ${mappingPath} is missing canonical states: ${missing
        .map((property) => STATUS_PROPERTY_TO_CANONICAL[property])
        .join(", ")}. Run /prepare-repo to refresh the repo-specific tracker docs.`,
    );
  }

  return Object.fromEntries(
    Object.entries(STATUS_PROPERTY_TO_CANONICAL)
      .filter(([, canonical]) => rawMapping[canonical])
      .map(([property, canonical]) => [property, rawMapping[canonical]]),
  );
}

function resolveStatuses(anchorPath, overrides = {}) {
  return {
    ...loadMappedStatuses(anchorPath),
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value)),
  };
}

function listMarkdownFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

function parseScalar(value) {
  const trimmed = String(value).trim();

  if (trimmed === "[]") {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(",").map((item) => parseScalar(item));
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null" || trimmed === "~") {
    return null;
  }

  return trimmed;
}

function parseFrontmatter(raw) {
  const data = {};
  const order = [];
  const lines = raw.split(/\r?\n/);
  let currentListKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const listItem = line.match(/^\s+-\s*(.*)$/);
    if (currentListKey && listItem) {
      data[currentListKey].push(parseScalar(listItem[1]));
      continue;
    }

    currentListKey = null;

    const pair = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!pair) {
      continue;
    }

    const key = pair[1];
    const value = pair[2].trim();
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      order.push(key);
    }

    if (value === "") {
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = parseScalar(value);
    }
  }

  return { data, order };
}

function readMarkdownDocument(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const bom = text.charCodeAt(0) === 0xfeff ? "\ufeff" : "";
  const offset = bom ? 1 : 0;

  if (!text.slice(offset).startsWith("---")) {
    return {
      body: text.slice(offset),
      bom,
      hasFrontmatter: false,
      meta: {},
      newline,
      order: [],
      text,
    };
  }

  const openerEnd = text.indexOf("\n", offset);
  if (openerEnd === -1) {
    throw new ToolError(`invalid front matter opener: ${filePath}`);
  }

  const bodyStart = openerEnd + 1;
  const rest = text.slice(bodyStart);
  const closer = rest.match(/\r?\n---(?:\r?\n|$)/);
  if (!closer) {
    throw new ToolError(`missing front matter closer: ${filePath}`);
  }

  const frontmatterText = rest.slice(0, closer.index);
  const afterCloser = bodyStart + closer.index + closer[0].length;
  const parsed = parseFrontmatter(frontmatterText);

  return {
    body: text.slice(afterCloser),
    bom,
    hasFrontmatter: true,
    meta: parsed.data,
    newline,
    order: parsed.order,
    text,
  };
}

function renderScalar(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }

  const text = String(value);
  if (/^[A-Za-z0-9_./@-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function orderedKeys(meta, originalOrder) {
  const keys = [];
  const seen = new Set();

  for (const preferred of FRONTMATTER_KEY_ORDER) {
    if (Object.prototype.hasOwnProperty.call(meta, preferred)) {
      keys.push(preferred);
      seen.add(preferred);
    }
  }

  for (const key of originalOrder) {
    if (!seen.has(key) && Object.prototype.hasOwnProperty.call(meta, key)) {
      keys.push(key);
      seen.add(key);
    }
  }

  for (const key of Object.keys(meta)) {
    if (!seen.has(key)) {
      keys.push(key);
    }
  }

  return keys;
}

function renderFrontmatter(meta, originalOrder, newline) {
  const lines = [];
  for (const key of orderedKeys(meta, originalOrder)) {
    const value = meta[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${renderScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${renderScalar(value)}`);
    }
  }
  return `${lines.join(newline)}${newline}`;
}

function renderMarkdownDocument(doc) {
  if (!doc.hasFrontmatter) {
    throw new ToolError("cannot update markdown without front matter");
  }

  return [
    doc.bom,
    "---",
    doc.newline,
    renderFrontmatter(doc.meta, doc.order, doc.newline),
    "---",
    doc.newline,
    doc.body,
  ].join("");
}

function makeComment(lines) {
  return [`### Orchestration ${new Date().toISOString()}`, ...lines].join("\n");
}

function appendComment(body, newline, comment) {
  const normalized = `${comment.trimEnd()}${newline}`;
  const trimmedBody = body.replace(/\s*$/u, "");
  const commentsHeading = /^##\s+Comments\s*$/im;

  if (commentsHeading.test(body)) {
    return `${trimmedBody}${newline}${newline}${normalized}`;
  }

  return `${trimmedBody}${newline}${newline}## Comments${newline}${newline}${normalized}`;
}

function updateMarkdownFile(filePath, mutateMeta, commentLines) {
  const doc = readMarkdownDocument(filePath);
  if (!doc.hasFrontmatter) {
    throw new ToolError(`missing front matter: ${filePath}`);
  }

  mutateMeta(doc.meta);
  if (commentLines && commentLines.length) {
    doc.body = appendComment(doc.body, doc.newline, makeComment(commentLines));
  }

  fs.writeFileSync(filePath, renderMarkdownDocument(doc), "utf8");
}

function loadMarkdownRecord(filePath, displayRoot) {
  const resolved = path.resolve(filePath);
  const doc = readMarkdownDocument(resolved);
  return {
    doc,
    filePath: resolved,
    frontmatter: doc.meta,
    path: displayRoot ? toDisplayPath(displayRoot, resolved) : resolved.replace(/\\/g, "/"),
    text: doc.text,
  };
}

function loadIssueIndex(issueFiles, roots) {
  const records = [];
  const byKey = new Map();
  const errors = [];
  const normalizedRoots = roots.filter(Boolean).map((root) => path.resolve(root));
  const displayRoot = normalizedRoots[0] || process.cwd();

  for (const filePath of issueFiles) {
    try {
      const record = loadMarkdownRecord(filePath, displayRoot);
      records.push(record);

      const keys = [normalizePathKey(record.filePath)];
      for (const root of normalizedRoots) {
        const relative = path.relative(root, record.filePath);
        if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
          const normalized = normalizeRelativeKey(relative);
          keys.push(normalized, `./${normalized}`);
        }
      }

      for (const key of keys) {
        byKey.set(key, record);
      }
    } catch (error) {
      errors.push({
        error: error.message,
        path: displayRoot ? toDisplayPath(displayRoot, filePath) : filePath,
      });
    }
  }

  return { byKey, displayRoot, errors, records, roots: normalizedRoots };
}

function getBlockers(frontmatter) {
  if (!Object.prototype.hasOwnProperty.call(frontmatter, "blocked_by")) {
    return [];
  }

  if (Array.isArray(frontmatter.blocked_by)) {
    return frontmatter.blocked_by.filter((item) => String(item || "").trim());
  }

  const value = String(frontmatter.blocked_by || "").trim();
  return value ? [value] : [];
}

function resolveBlocker(index, issue, blockerRef) {
  const value = String(blockerRef || "").trim();
  if (!value) {
    return null;
  }

  const candidates = [
    normalizeRelativeKey(value),
    normalizeRelativeKey(`./${value}`),
    normalizePathKey(path.resolve(process.cwd(), value)),
    normalizePathKey(path.resolve(path.dirname(issue.filePath), value)),
  ];

  for (const root of index.roots) {
    candidates.push(normalizePathKey(path.resolve(root, value)));
  }

  for (const candidate of candidates) {
    const match = index.byKey.get(candidate);
    if (match) {
      return match;
    }
  }

  return null;
}

function findLatestAgentBrief(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^##\s+Agent Brief\s*$/i.test(lines[index].trim())) {
      start = index;
    }
  }

  if (start === -1) {
    return { exists: false, hasAcceptanceCriteria: false };
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+Agent Brief\s*$/i.test(lines[index].trim())) {
      end = index;
      break;
    }
  }

  const brief = lines.slice(start, end).join("\n");
  const hasAcceptanceHeading =
    /\*\*Acceptance criteria:\*\*/i.test(brief) ||
    /^#{2,}\s+Acceptance Criteria\s*$/im.test(brief);
  const hasChecklistItem = /^\s*-\s+\[[ xX]\]\s+\S/m.test(brief);

  return {
    exists: true,
    hasAcceptanceCriteria: hasAcceptanceHeading && hasChecklistItem,
  };
}

function outputIssue(record, scopeRoot) {
  const meta = record.frontmatter;
  return {
    blocked_by: getBlockers(meta),
    branch: meta.branch || null,
    category: meta.category || null,
    path: toDisplayPath(scopeRoot, record.filePath),
    status: meta.status || null,
    type: meta.type || null,
    worktree_path: meta.worktree_path || null,
  };
}

function evaluateReadyIssues(index, options) {
  const launchable = [];
  const blocked = [];
  const claimed = [];
  const notLaunchable = [];
  const scopeRoot = index.displayRoot;

  for (const issue of index.records) {
    const meta = issue.frontmatter;
    if (meta.type !== "Issue") {
      continue;
    }

    if (meta.status === options.inProgressStatus || meta.worktree_path) {
      claimed.push({
        ...outputIssue(issue, scopeRoot),
        reason: meta.status === options.inProgressStatus ? "in_progress" : "has_worktree_path",
      });
      continue;
    }

    if (meta.status !== options.readyStatus) {
      continue;
    }

    if (meta.branch || meta.worktree_path) {
      claimed.push({
        ...outputIssue(issue, scopeRoot),
        reason: "ready_status_with_claim",
      });
      continue;
    }

    const blockers = getBlockers(meta);
    const blockerResults = blockers.map((blockerRef) => {
      const blocker = resolveBlocker(index, issue, blockerRef);
      if (!blocker) {
        return {
          done: false,
          ref: blockerRef,
          resolved: false,
        };
      }

      return {
        done: blocker.frontmatter.status === options.doneStatus,
        path: toDisplayPath(scopeRoot, blocker.filePath),
        ref: blockerRef,
        resolved: true,
        status: blocker.frontmatter.status || null,
      };
    });

    if (!blockerResults.every((blocker) => blocker.done)) {
      blocked.push({
        ...outputIssue(issue, scopeRoot),
        blockers: blockerResults,
      });
      continue;
    }

    const agentBrief = findLatestAgentBrief(issue.text);
    if (!agentBrief.exists || !agentBrief.hasAcceptanceCriteria) {
      notLaunchable.push({
        ...outputIssue(issue, scopeRoot),
        reason: !agentBrief.exists ? "missing_agent_brief" : "missing_acceptance_criteria",
      });
      continue;
    }

    launchable.push(outputIssue(issue, scopeRoot));
  }

  return { blocked, claimed, launchable, not_launchable: notLaunchable };
}

function loadPrdScope(prdPath) {
  const resolvedPrd = path.resolve(prdPath);
  if (!fs.existsSync(resolvedPrd) || !fs.statSync(resolvedPrd).isFile()) {
    throw new ToolError(`PRD not found: ${prdPath}`);
  }

  const prd = loadMarkdownRecord(resolvedPrd, path.dirname(resolvedPrd));
  if (prd.frontmatter.type !== "PRD") {
    throw new ToolError(`not a PRD: ${prdPath}`);
  }

  const featureRoot = path.dirname(resolvedPrd);
  const issueRoot = path.join(featureRoot, "issues");
  const issueFiles = listMarkdownFiles(issueRoot);
  const index = loadIssueIndex(issueFiles, [featureRoot, issueRoot, process.cwd()]);

  return {
    featureRoot,
    index,
    issueRoot,
    prd,
    prdPath: resolvedPrd,
  };
}

function loadLegacyScope(root) {
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new ToolError(`folder not found: ${root}`);
  }

  const issueFiles = listMarkdownFiles(resolvedRoot);
  return {
    index: loadIssueIndex(issueFiles, [resolvedRoot, process.cwd()]),
    issueRoot: resolvedRoot,
    prdPath: null,
  };
}

function parseFindReadyArgs(args) {
  const options = {
    doneStatus: null,
    help: false,
    pretty: false,
    prd: null,
    readyStatus: null,
    root: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--prd") {
      options.prd = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--root") {
      options.root = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--ready-status") {
      options.readyStatus = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--done-status") {
      options.doneStatus = takeValue(args, index, arg);
      index += 1;
    } else if (!arg.startsWith("--") && !options.prd && !options.root) {
      options.root = arg;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function cmdFindReady(args) {
  const options = parseFindReadyArgs(args);
  if (options.help) {
    console.log(commandUsage("find-ready"));
    return 0;
  }
  if (!options.prd && !options.root) {
    throw new UsageError(commandUsage("find-ready"));
  }

  const scope = options.prd ? loadPrdScope(options.prd) : loadLegacyScope(options.root);
  const statuses = resolveStatuses(options.prd || options.root || scope.issueRoot, {
    done: options.doneStatus,
    readyForAgent: options.readyStatus,
  });
  const result = evaluateReadyIssues(scope.index, {
    doneStatus: statuses.done,
    inProgressStatus: statuses.inProgress,
    readyStatus: statuses.readyForAgent,
  });
  const output = {
    blocked: result.blocked,
    claimed: result.claimed,
    done_status: statuses.done,
    errors: scope.index.errors,
    issue_root: scope.issueRoot,
    launchable: result.launchable,
    not_launchable: result.not_launchable,
    prd_path: scope.prdPath,
    ready: result.launchable,
    ready_status: statuses.readyForAgent,
    root: scope.issueRoot,
  };

  emit(output, options.pretty);
  return scope.index.errors.length ? 1 : 0;
}

function runGit(args, cwd) {
  return childProcess.spawnSync("git", args, {
    cwd: String(cwd),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
}

function processMessage(processResult) {
  const stderr = String(processResult.stderr || "").trim();
  const stdout = String(processResult.stdout || "").trim();
  return stderr || stdout || `process exited with code ${processResult.status}`;
}

function dubiousOwnershipMessage(processResult) {
  const message = processMessage(processResult);
  if (!message.includes("dubious ownership") && !message.includes("safe.directory")) {
    return null;
  }

  const repoMatch = message.match(/repository at '([^']+)'/);
  const configMatch = message.match(/safe\.directory ([^\r\n]+)/);
  const repoPath = repoMatch ? repoMatch[1] : null;
  const safeArg = configMatch ? configMatch[1].trim() : repoPath;
  if (repoPath && safeArg) {
    return `git refused repository due to dubious ownership: ${repoPath}. Configure safe.directory outside this tool: git config --global --add safe.directory ${safeArg}`;
  }
  return `git refused repository due to dubious ownership. ${message}`;
}

function requireGitOk(processResult, action) {
  if (processResult.status === 0) {
    return String(processResult.stdout || "").trim();
  }

  const dubious = dubiousOwnershipMessage(processResult);
  if (dubious) {
    throw new ToolError(dubious);
  }
  throw new ToolError(`${action} failed: ${processMessage(processResult)}`);
}

function findRepoRoot(cwd) {
  const output = requireGitOk(runGit(["rev-parse", "--show-toplevel"], cwd), "repo discovery");
  if (!output) {
    throw new ToolError("repo discovery failed: git returned empty repo root");
  }
  return path.resolve(output);
}

function defaultWorktreeRoot(repoRoot) {
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-worktrees`);
}

function repoIsDirty(repoRoot) {
  const output = requireGitOk(runGit(["status", "--porcelain"], repoRoot), "checking git status");
  return output.trim().length > 0;
}

function gitRefExists(repoRoot, ref) {
  const result = runGit(["show-ref", "--verify", "--quiet", `refs/heads/${ref}`], repoRoot);
  if (result.status === 0) {
    return true;
  }
  if (result.status === 1) {
    return false;
  }
  requireGitOk(result, `checking branch ${ref}`);
  return false;
}

function slugPart(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "issue";
}

function issueSlug(issuePath, repoRelative) {
  const digest = crypto
    .createHash("sha1")
    .update(repoRelative)
    .digest("hex")
    .slice(0, DEFAULT_HASH_LEN);
  return `${slugPart(path.basename(issuePath, path.extname(issuePath)))}-${digest}`;
}

function validateIssuePath(rawIssuePath, cwd, repoRoot) {
  let issuePath = path.resolve(cwd, rawIssuePath);
  if (path.isAbsolute(rawIssuePath)) {
    issuePath = path.resolve(rawIssuePath);
  }

  const relative = repoRelativePath(repoRoot, issuePath);
  if (!fs.existsSync(issuePath)) {
    throw new ToolError(`issue path does not exist: ${relative}`);
  }
  if (!fs.statSync(issuePath).isFile()) {
    throw new ToolError(`issue path is not a file: ${relative}`);
  }
  if (path.extname(issuePath).toLowerCase() !== ".md") {
    throw new ToolError(`issue path must be a Markdown file: ${relative}`);
  }

  return { issuePath, relative };
}

function buildIssuePrompt(issuePath) {
  return [
    `Implement the issue described in ${issuePath}.`,
    "Read the issue file, complete the work, update tests, and report back with acceptance criteria status, validation, and gaps only.",
    "Do not modify the issue metadata except as instructed by the orchestrator.",
  ].join("\n");
}

function planWorktree(rawIssuePath, cwd, repoRoot, worktreeRoot, baseRef) {
  const issue = validateIssuePath(rawIssuePath, cwd, repoRoot);
  const slug = issueSlug(issue.issuePath, issue.relative);
  const branch = `issue/${slug}`;
  const worktreePath = path.resolve(worktreeRoot, slug);

  if (gitRefExists(repoRoot, branch)) {
    throw new ToolError(`branch already exists: ${branch}`);
  }
  if (fs.existsSync(worktreePath)) {
    throw new ToolError(`worktree path already exists: ${worktreePath}`);
  }

  return {
    base_ref: baseRef,
    branch,
    issue_path: issue.relative,
    prompt: buildIssuePrompt(issue.relative),
    worktree_path: worktreePath,
  };
}

function createWorktree(repoRoot, entry) {
  fs.mkdirSync(path.dirname(entry.worktree_path), { recursive: true });
  requireGitOk(
    runGit(["worktree", "add", "-b", entry.branch, entry.worktree_path, entry.base_ref], repoRoot),
    `creating worktree ${entry.worktree_path}`,
  );
}

function parseCreateWorktreesArgs(args) {
  const options = {
    allowDirtyBase: false,
    base: "HEAD",
    dryRun: false,
    help: false,
    issuePaths: [],
    limit: null,
    markInProgress: false,
    pretty: false,
    prd: null,
    root: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--prd") {
      options.prd = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--issue") {
      options.issuePaths.push(takeValue(args, index, arg));
      index += 1;
    } else if (arg === "--base") {
      options.base = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--root") {
      options.root = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--limit") {
      options.limit = parsePositiveInteger(takeValue(args, index, arg), arg);
      index += 1;
    } else if (arg === "--mark-in-progress") {
      options.markInProgress = true;
    } else if (arg === "--allow-dirty-base") {
      options.allowDirtyBase = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (!arg.startsWith("--")) {
      options.issuePaths.push(arg);
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function issuePathsFromPrd(prdPath, limit, statuses) {
  const scope = loadPrdScope(prdPath);
  const evaluated = evaluateReadyIssues(scope.index, {
    doneStatus: statuses.done,
    inProgressStatus: statuses.inProgress,
    readyStatus: statuses.readyForAgent,
  });
  const selected = limit ? evaluated.launchable.slice(0, limit) : evaluated.launchable;
  return {
    blocked: evaluated.blocked,
    claimed: evaluated.claimed,
    errors: scope.index.errors,
    issuePaths: selected.map((issue) => path.resolve(scope.featureRoot, issue.path)),
    not_launchable: evaluated.not_launchable,
    prdPath: scope.prdPath,
  };
}

function markIssueInProgress(issuePath, entry, statuses) {
  updateMarkdownFile(
    issuePath,
    (meta) => {
      meta.status = statuses.inProgress;
      meta.branch = entry.branch;
      meta.worktree_path = entry.worktree_path;
    },
    [
      "- Action: worktree created",
      `- Branch: \`${entry.branch}\``,
      `- Worktree: \`${entry.worktree_path}\``,
      `- Base: \`${entry.base_ref}\``,
    ],
  );
}

function cmdCreateWorktrees(args) {
  const options = parseCreateWorktreesArgs(args);
  if (options.help) {
    console.log(commandUsage("create-worktrees"));
    return 0;
  }
  if (!options.prd && options.issuePaths.length === 0) {
    throw new UsageError(commandUsage("create-worktrees"));
  }

  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const statuses = resolveStatuses(repoRoot);
  const worktreeRoot = path.resolve(options.root || defaultWorktreeRoot(repoRoot));
  let issuePaths = options.issuePaths.slice();
  let prdDiscovery = null;

  if (options.prd) {
    prdDiscovery = issuePathsFromPrd(options.prd, options.limit, statuses);
    if (issuePaths.length === 0) {
      issuePaths = prdDiscovery.issuePaths;
    }
  } else if (options.limit && issuePaths.length > options.limit) {
    issuePaths = issuePaths.slice(0, options.limit);
  }

  if (!options.allowDirtyBase && !options.dryRun && repoIsDirty(repoRoot)) {
    throw new ToolError("orchestrator repo is dirty; use --allow-dirty-base to override");
  }

  const created = [];
  const errors = [];
  const reservedBranches = new Set();
  const reservedWorktrees = new Set();

  for (const rawIssuePath of issuePaths) {
    try {
      const entry = planWorktree(rawIssuePath, cwd, repoRoot, worktreeRoot, options.base);
      if (reservedBranches.has(entry.branch)) {
        throw new ToolError(`branch already planned: ${entry.branch}`);
      }
      if (reservedWorktrees.has(entry.worktree_path)) {
        throw new ToolError(`worktree path already planned: ${entry.worktree_path}`);
      }

      if (!options.dryRun) {
        createWorktree(repoRoot, entry);
        if (options.markInProgress) {
          markIssueInProgress(path.resolve(repoRoot, entry.issue_path), entry, statuses);
        }
      }

      created.push(entry);
      reservedBranches.add(entry.branch);
      reservedWorktrees.add(entry.worktree_path);
    } catch (error) {
      errors.push({
        error: error.message,
        issue_path: rawIssuePath,
      });
    }
  }

  emit(
    {
      blocked: prdDiscovery ? prdDiscovery.blocked : [],
      claimed: prdDiscovery ? prdDiscovery.claimed : [],
      created,
      errors: [...(prdDiscovery ? prdDiscovery.errors : []), ...errors],
      not_launchable: prdDiscovery ? prdDiscovery.not_launchable : [],
      prd_path: prdDiscovery ? prdDiscovery.prdPath : null,
      worktree_root: worktreeRoot,
    },
    options.pretty,
  );
  return prdDiscovery && prdDiscovery.errors.length ? 1 : errors.length ? 1 : 0;
}

function parseAgentReport(reportPath) {
  return parseAgentReportText(fs.readFileSync(reportPath, "utf8"));
}

function parseAgentReportText(text) {
  const lines = text.split(/\r?\n/);
  const resultIndex = lines.findIndex((line) => /^##\s+Result\s*$/i.test(line.trim()));
  const hasAcceptanceCriteria = lines.some((line) =>
    /^##\s+Acceptance Criteria\s*$/i.test(line.trim()),
  );

  if (resultIndex === -1) {
    return { hasAcceptanceCriteria, result: null, valid: false };
  }

  let result = null;
  for (let index = resultIndex + 1; index < lines.length; index += 1) {
    const value = lines[index].trim();
    if (value) {
      result = value;
      break;
    }
  }

  return {
    hasAcceptanceCriteria,
    result,
    text,
    valid: ["PASS", "FAIL", "BLOCKED"].includes(result) && hasAcceptanceCriteria,
  };
}

function resolveReportPath(rawReportPath, worktreePath) {
  const candidates = [
    path.resolve(process.cwd(), rawReportPath),
    path.resolve(worktreePath, rawReportPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new ToolError(`report not found: ${rawReportPath}`);
}

function resolveWritableReportPath(rawReportPath, worktreePath) {
  if (!rawReportPath) {
    return path.resolve(worktreePath, DEFAULT_REPORT_PATH);
  }

  if (path.isAbsolute(rawReportPath)) {
    return path.resolve(rawReportPath);
  }

  return path.resolve(worktreePath, rawReportPath);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function tail(value, maxLength = 4000) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(text.length - maxLength);
}

function runVerifyCommand(command, worktreePath) {
  const result = childProcess.spawnSync(command, {
    cwd: worktreePath,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
  });

  return {
    command,
    exit_code: result.status,
    stderr: tail(result.stderr),
    stdout: tail(result.stdout),
  };
}

function currentBranch(worktreePath) {
  return requireGitOk(runGit(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath), "reading worktree branch");
}

function gitStatus(worktreePath) {
  return requireGitOk(runGit(["status", "--porcelain"], worktreePath), "checking worktree status");
}

function normalizeReportText(text) {
  return String(text || "").replace(/\r?\n/g, "\n").trimEnd() + "\n";
}

function releaseIssueForHuman(issuePath, evidenceLines, statuses) {
  updateMarkdownFile(
    issuePath,
    (meta) => {
      meta.status = statuses.readyForHuman;
    },
    evidenceLines,
  );
}

function commitWorktreeChanges(worktreePath, issuePath, branch) {
  const status = gitStatus(worktreePath);
  if (!status.trim()) {
    return { committed: false, reason: "no_changes" };
  }

  requireGitOk(runGit(["add", "-A"], worktreePath), "staging worktree changes");
  requireGitOk(
    runGit(
      [
        "commit",
        "-m",
        `Implement ${path.basename(issuePath, path.extname(issuePath))}`,
        "-m",
        `Issue: ${issuePath}`,
      ],
      worktreePath,
    ),
    `committing worktree changes on ${branch}`,
  );
  const sha = requireGitOk(runGit(["rev-parse", "HEAD"], worktreePath), "reading commit sha");
  return { committed: true, sha };
}

function markIssueDone(issuePath, evidenceLines, statuses) {
  updateMarkdownFile(
    issuePath,
    (meta) => {
      meta.status = statuses.done;
      delete meta.worktree_path;
    },
    evidenceLines,
  );
}

function markIssueNeedsInfo(issuePath, evidenceLines, statuses) {
  updateMarkdownFile(
    issuePath,
    (meta) => {
      meta.status = statuses.needsInfo;
    },
    evidenceLines,
  );
}

function parseMergeWorktreeArgs(args) {
  const options = {
    deleteBranch: false,
    help: false,
    issue: null,
    keepWorktree: false,
    pretty: false,
    report: null,
    verifyCommand: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--issue") {
      options.issue = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--report") {
      options.report = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--verify-command") {
      options.verifyCommand = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--delete-branch") {
      options.deleteBranch = true;
    } else if (arg === "--keep-worktree") {
      options.keepWorktree = true;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function parseWriteReportArgs(args) {
  const options = {
    help: false,
    issue: null,
    output: null,
    outputBase64: null,
    outputFile: null,
    pretty: false,
    report: DEFAULT_REPORT_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--issue") {
      options.issue = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--report") {
      options.report = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--output") {
      options.output = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--output-file") {
      options.outputFile = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--output-base64") {
      options.outputBase64 = takeValue(args, index, arg);
      index += 1;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function reportTextFromOptions(options, cwd) {
  const provided = [options.output, options.outputFile, options.outputBase64].filter(
    (value) => value !== null,
  );
  if (provided.length !== 1) {
    throw new UsageError("write-report requires exactly one of --output, --output-file, or --output-base64");
  }

  if (options.output !== null) {
    return options.output;
  }
  if (options.outputFile !== null) {
    return fs.readFileSync(path.resolve(cwd, options.outputFile), "utf8");
  }
  return Buffer.from(options.outputBase64, "base64").toString("utf8");
}

function cmdWriteReport(args) {
  const options = parseWriteReportArgs(args);
  if (options.help) {
    console.log(commandUsage("write-report"));
    return 0;
  }
  if (!options.issue) {
    throw new UsageError(commandUsage("write-report"));
  }

  const repoRoot = findRepoRoot(process.cwd());
  const issuePath = path.resolve(process.cwd(), options.issue);
  const issueRecord = loadMarkdownRecord(issuePath, repoRoot);
  const worktreePath = issueRecord.frontmatter.worktree_path;
  if (!worktreePath) {
    throw new ToolError("issue is missing worktree_path front matter");
  }
  if (!fs.existsSync(worktreePath) || !fs.statSync(worktreePath).isDirectory()) {
    throw new ToolError(`worktree not found: ${worktreePath}`);
  }

  const reportText = normalizeReportText(reportTextFromOptions(options, process.cwd()));
  const parsed = parseAgentReportText(reportText);
  const issueDisplayPath = repoRelativePath(repoRoot, issuePath);
  const reportPath = resolveWritableReportPath(options.report, worktreePath);

  if (!parsed.valid) {
    emit(
      {
        issue_path: issueDisplayPath,
        report_path: reportPath,
        result: parsed.result,
        status: "INVALID_REPORT",
      },
      options.pretty,
    );
    return 1;
  }

  ensureParentDir(reportPath);
  fs.writeFileSync(reportPath, reportText, "utf8");
  emit(
    {
      issue_path: issueDisplayPath,
      report_path: reportPath,
      result: parsed.result,
      status: "REPORT_WRITTEN",
    },
    options.pretty,
  );
  return 0;
}

function cmdMergeWorktree(args) {
  const options = parseMergeWorktreeArgs(args);
  if (options.help) {
    console.log(commandUsage("merge-worktree"));
    return 0;
  }
  if (!options.issue || !options.report) {
    throw new UsageError(commandUsage("merge-worktree"));
  }

  const repoRoot = findRepoRoot(process.cwd());
  const statuses = resolveStatuses(repoRoot);
  const issuePath = path.resolve(process.cwd(), options.issue);
  const issueRecord = loadMarkdownRecord(issuePath, repoRoot);
  const branch = issueRecord.frontmatter.branch;
  const worktreePath = issueRecord.frontmatter.worktree_path;

  if (!branch || !worktreePath) {
    throw new ToolError("issue is missing branch or worktree_path front matter");
  }
  if (!fs.existsSync(worktreePath) || !fs.statSync(worktreePath).isDirectory()) {
    throw new ToolError(`worktree not found: ${worktreePath}`);
  }

  const reportPath = resolveReportPath(options.report, worktreePath);
  const report = parseAgentReport(reportPath);
  const issueDisplayPath = repoRelativePath(repoRoot, issuePath);

  if (!report.valid) {
    emit(
      {
        issue_path: issueDisplayPath,
        report_path: reportPath,
        result: report.result,
        status: "INVALID_REPORT",
      },
      options.pretty,
    );
    return 1;
  }

  if (report.result === "FAIL") {
    releaseIssueForHuman(issuePath, [
      "- Action: agent report failed",
      `- Report: \`${reportPath}\``,
    ], statuses);
    emit({ issue_path: issueDisplayPath, report_path: reportPath, status: "FAILED" }, options.pretty);
    return 0;
  }

  if (report.result === "BLOCKED") {
    markIssueNeedsInfo(issuePath, [
      "- Action: agent report blocked",
      `- Report: \`${reportPath}\``,
    ], statuses);
    emit({ issue_path: issueDisplayPath, report_path: reportPath, status: "BLOCKED" }, options.pretty);
    return 0;
  }

  if (currentBranch(worktreePath) !== branch) {
    throw new ToolError(`worktree is not on expected branch: ${branch}`);
  }

  if (options.verifyCommand) {
    const verification = runVerifyCommand(options.verifyCommand, worktreePath);
    if (verification.exit_code !== 0) {
      updateMarkdownFile(issuePath, () => {}, [
        "- Action: verification failed",
        `- Command: \`${options.verifyCommand}\``,
        `- Report: \`${reportPath}\``,
      ]);
      emit(
        {
          issue_path: issueDisplayPath,
          report_path: reportPath,
          status: "VERIFY_FAILED",
          verification,
        },
        options.pretty,
      );
      return 0;
    }
  }

  const commit = commitWorktreeChanges(worktreePath, issueDisplayPath, branch);
  if (!commit.committed) {
    updateMarkdownFile(issuePath, () => {}, [
      "- Action: merge skipped",
      "- Reason: no worktree changes",
      `- Report: \`${reportPath}\``,
    ]);
    emit(
      {
        issue_path: issueDisplayPath,
        reason: commit.reason,
        report_path: reportPath,
        status: "NO_CHANGES",
      },
      options.pretty,
    );
    return 0;
  }

  const merge = runGit(["merge", "--no-ff", branch, "-m", `Merge ${branch}`], repoRoot);
  if (merge.status !== 0) {
    const message = processMessage(merge);
    const status = message.includes("CONFLICT") ? "MERGE_CONFLICT" : "MERGE_FAILED";
    if (status === "MERGE_CONFLICT") {
      markIssueNeedsInfo(issuePath, [
        "- Action: merge conflict",
        `- Branch: \`${branch}\``,
        `- Worktree: \`${worktreePath}\``,
        `- Report: \`${reportPath}\``,
      ], statuses);
    } else {
      releaseIssueForHuman(issuePath, [
        "- Action: merge failed",
        `- Branch: \`${branch}\``,
        `- Worktree: \`${worktreePath}\``,
        `- Report: \`${reportPath}\``,
      ], statuses);
    }
    emit(
      {
        issue_path: issueDisplayPath,
        message,
        report_path: reportPath,
        status,
      },
      options.pretty,
    );
    return 0;
  }

  markIssueDone(issuePath, [
    "- Action: merged worktree",
    `- Branch: \`${branch}\``,
    `- Worktree: \`${worktreePath}\``,
    `- Report: \`${reportPath}\``,
    commit.sha ? `- Commit: \`${commit.sha}\`` : null,
    options.verifyCommand ? `- Verification: \`${options.verifyCommand}\`` : null,
  ].filter(Boolean), statuses);

  const cleanupErrors = [];
  if (!options.keepWorktree) {
    const remove = runGit(["worktree", "remove", worktreePath], repoRoot);
    if (remove.status !== 0) {
      cleanupErrors.push({ action: "remove_worktree", error: processMessage(remove) });
    }
  }

  if (options.deleteBranch) {
    const deleted = runGit(["branch", "-d", branch], repoRoot);
    if (deleted.status !== 0) {
      cleanupErrors.push({ action: "delete_branch", error: processMessage(deleted) });
    }
  }

  emit(
    {
      branch,
      cleanup_errors: cleanupErrors,
      commit_sha: commit.sha,
      issue_path: issueDisplayPath,
      report_path: reportPath,
      status: cleanupErrors.length ? "MERGED_WITH_CLEANUP_ERRORS" : "MERGED",
      worktree_path: worktreePath,
    },
    options.pretty,
  );
  return cleanupErrors.length ? 1 : 0;
}

function completionForPrd(prdPath, statuses) {
  const scope = loadPrdScope(prdPath);
  const issues = scope.index.records.filter((record) => record.frontmatter.type === "Issue");
  const done = [];
  const wontfix = [];
  const nonTerminal = [];

  for (const issue of issues) {
    const entry = {
      path: toDisplayPath(scope.featureRoot, issue.filePath),
      status: issue.frontmatter.status || null,
    };
    if (issue.frontmatter.status === statuses.done) {
      done.push(entry);
    } else if (issue.frontmatter.status === statuses.wontfix) {
      wontfix.push(entry);
    } else {
      nonTerminal.push(entry);
    }
  }

  return {
    complete: issues.length > 0 && nonTerminal.length === 0 && scope.index.errors.length === 0,
    done,
    errors: scope.index.errors,
    non_terminal: nonTerminal,
    prd_path: scope.prdPath,
    total: issues.length,
    wontfix,
  };
}

function extractSection(body, heading) {
  const lines = String(body || "").split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  const startIndex = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (startIndex === -1) {
    return "";
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+\S/.test(lines[index].trim())) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex).join("\n").trim();
}

function extractUserStories(prdRecord) {
  const section = extractSection(prdRecord.doc.body, "User Stories");
  if (!section) {
    return [];
  }

  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => {
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      return {
        id: match[1],
        text: match[2].trim(),
      };
    });
}

function storyTokens(text) {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
    ),
  );
}

function issueCoverageText(issueRecord) {
  return [
    path.basename(issueRecord.filePath, path.extname(issueRecord.filePath)),
    issueRecord.doc.body,
  ].join("\n");
}

function parseExplicitStoryCoverage(issueRecord) {
  const section = extractSection(issueRecord.doc.body, "User stories covered");
  if (!section) {
    return [];
  }

  const storyIds = new Set();
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^\d+\.\s+/.test(trimmed)) {
      continue;
    }

    const entry = trimmed.replace(/^\d+\.\s+/, "");
    const matches = Array.from(
      entry.matchAll(/\b(?:prd\s+)?stor(?:y|ies)\s*#?\s*(\d+)\b/gi),
      (match) => match[1],
    );
    for (const storyId of matches) {
      storyIds.add(storyId);
    }
  }

  return Array.from(storyIds).sort((left, right) => Number(left) - Number(right));
}

function explicitCoverageIndex(issues, featureRoot) {
  const coverage = new Map();

  for (const issue of issues) {
    for (const storyId of parseExplicitStoryCoverage(issue)) {
      if (!coverage.has(storyId)) {
        coverage.set(storyId, []);
      }
      coverage.get(storyId).push({
        coverage_source: "explicit",
        path: toDisplayPath(featureRoot, issue.filePath),
        status: issue.frontmatter.status || null,
      });
    }
  }

  return coverage;
}

function findSupportingIssues(story, issues, featureRoot, coverageSource = "legacy-inferred") {
  const tokens = storyTokens(story.text);
  if (tokens.length === 0) {
    return [];
  }

  const storyNumberPatterns = [
    new RegExp(`\\buser stor(?:y|ies)\\s*${story.id}\\b`, "i"),
    new RegExp(`\\bstory\\s*${story.id}\\b`, "i"),
    new RegExp(`\\b${story.id}\\b\\s*[:.-]`, "i"),
  ];

  const matches = [];
  for (const issue of issues) {
    const text = issueCoverageText(issue);
    const lowered = text.toLowerCase();
    const overlap = tokens.filter((token) => lowered.includes(token));
    const explicitMatch = storyNumberPatterns.some((pattern) => pattern.test(text));
    if (!explicitMatch && overlap.length < Math.min(2, tokens.length)) {
      continue;
    }

    matches.push({
      coverage_source: coverageSource,
      overlap,
      path: toDisplayPath(featureRoot, issue.filePath),
      status: issue.frontmatter.status || null,
    });
  }

  matches.sort((left, right) => right.overlap.length - left.overlap.length || left.path.localeCompare(right.path));
  return matches;
}

function reviewPrd(prdPath) {
  const statuses = resolveStatuses(prdPath);
  const completion = completionForPrd(prdPath, statuses);
  const scope = loadPrdScope(prdPath);
  const userStories = extractUserStories(scope.prd);
  const terminalIssues = scope.index.records.filter((record) => {
    if (record.frontmatter.type !== "Issue") {
      return false;
    }
    return (
      record.frontmatter.status === statuses.done ||
      record.frontmatter.status === statuses.wontfix
    );
  });
  const explicitCoverage = explicitCoverageIndex(terminalIssues, scope.featureRoot);
  const legacyIssues = terminalIssues.filter((issue) => parseExplicitStoryCoverage(issue).length === 0);

  const covered = [];
  const uncovered = [];
  let legacyFallbackUsed = false;

  for (const story of userStories) {
    const explicitSupport = explicitCoverage.get(story.id) || [];
    const support =
      explicitSupport.length > 0
        ? explicitSupport
        : findSupportingIssues(story, legacyIssues, scope.featureRoot, "legacy-inferred");
    if (explicitSupport.length === 0 && support.length > 0) {
      legacyFallbackUsed = true;
    }
    const entry = {
      coverage_source: explicitSupport.length > 0 ? "explicit" : support.length > 0 ? "legacy-inferred" : null,
      id: story.id,
      story: story.text,
      supporting_issues: support,
    };
    if (support.length > 0) {
      covered.push(entry);
    } else {
      uncovered.push(entry);
    }
  }

  return {
    ...completion,
    covered,
    coverage_summary: {
      explicit: covered.filter((entry) => entry.coverage_source === "explicit").length,
      legacy_inferred: covered.filter((entry) => entry.coverage_source === "legacy-inferred").length,
      uncovered: uncovered.length,
    },
    legacy_fallback_used: legacyFallbackUsed,
    review_passed: completion.complete && uncovered.length === 0,
    review_status: userStories.length === 0 ? "NO_USER_STORIES" : uncovered.length === 0 ? "PASS" : "COVERAGE_GAPS",
    stories_total: userStories.length,
    uncovered,
  };
}

function parseReviewPrdArgs(args) {
  const options = {
    help: false,
    pretty: false,
    prd: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--prd") {
      options.prd = takeValue(args, index, arg);
      index += 1;
    } else if (!arg.startsWith("--") && !options.prd) {
      options.prd = arg;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function cmdReviewPrd(args) {
  const options = parseReviewPrdArgs(args);
  if (options.help) {
    console.log(commandUsage("review-prd"));
    return 0;
  }
  if (!options.prd) {
    throw new UsageError(commandUsage("review-prd"));
  }

  const result = reviewPrd(options.prd);
  emit(result, options.pretty);
  return result.complete && (result.review_passed || result.review_status === "NO_USER_STORIES") ? 0 : 1;
}

function parseCheckCompleteArgs(args) {
  const options = {
    help: false,
    pretty: false,
    prd: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--prd") {
      options.prd = takeValue(args, index, arg);
      index += 1;
    } else if (!arg.startsWith("--") && !options.prd) {
      options.prd = arg;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function cmdCheckComplete(args) {
  const options = parseCheckCompleteArgs(args);
  if (options.help) {
    console.log(commandUsage("check-complete"));
    return 0;
  }
  if (!options.prd) {
    throw new UsageError(commandUsage("check-complete"));
  }

  const result = completionForPrd(options.prd, resolveStatuses(options.prd));
  emit(result, options.pretty);
  return result.errors.length ? 1 : 0;
}

function parseMarkDoneArgs(args) {
  const options = {
    evidence: null,
    help: false,
    issue: null,
    pretty: false,
    prd: null,
    report: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--prd") {
      options.prd = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--issue") {
      options.issue = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--path") {
      const value = takeValue(args, index, arg);
      index += 1;
      const resolved = path.resolve(process.cwd(), value);
      const record = loadMarkdownRecord(resolved, process.cwd());
      if (record.frontmatter.type === "PRD") {
        options.prd = value;
      } else if (record.frontmatter.type === "Issue") {
        options.issue = value;
      } else {
        throw new ToolError(`unknown item type: ${value}`);
      }
    } else if (arg === "--evidence") {
      options.evidence = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--report") {
      options.report = takeValue(args, index, arg);
      index += 1;
    } else {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
  }

  return options;
}

function cmdMarkDone(args) {
  const options = parseMarkDoneArgs(args);
  if (options.help) {
    console.log(commandUsage("mark-done"));
    return 0;
  }
  if ((options.prd && options.issue) || (!options.prd && !options.issue)) {
    throw new UsageError(commandUsage("mark-done"));
  }

  if (options.prd) {
    const review = reviewPrd(options.prd);
    if (!review.review_passed) {
      emit(
        {
          ...review,
          marked: false,
          status:
            review.total === 0
              ? "NO_ISSUES"
              : review.complete
                ? "REVIEW_FAILED"
                : "INCOMPLETE",
        },
        options.pretty,
      );
      return 0;
    }

    const statuses = resolveStatuses(review.prd_path);
    updateMarkdownFile(review.prd_path, (meta) => {
      meta.status = statuses.done;
    }, [
      "- Action: PRD marked done",
      `- Issues done: ${review.done.length}`,
      `- Issues wontfix: ${review.wontfix.length}`,
      `- User stories covered: ${review.covered.length}/${review.stories_total}`,
      `- Coverage source: explicit ${review.coverage_summary.explicit}, legacy-inferred ${review.coverage_summary.legacy_inferred}`,
    ]);

    emit({ ...review, marked: true, status: "DONE" }, options.pretty);
    return 0;
  }

  if (!options.evidence && !options.report) {
    throw new UsageError("mark-done --issue requires --evidence or --report");
  }

  const repoRoot = findRepoRoot(process.cwd());
  const statuses = resolveStatuses(repoRoot);
  const issuePath = path.resolve(process.cwd(), options.issue);
  const issueDisplayPath = repoRelativePath(repoRoot, issuePath);
  markIssueDone(issuePath, [
    "- Action: issue marked done",
    options.evidence ? `- Evidence: ${options.evidence}` : null,
    options.report ? `- Report: \`${path.resolve(process.cwd(), options.report)}\`` : null,
  ].filter(Boolean), statuses);

  emit({ issue_path: issueDisplayPath, marked: true, status: "DONE" }, options.pretty);
  return 0;
}

function dispatch(argv) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return command ? 0 : 1;
  }

  if (command === "find-ready") {
    return cmdFindReady(args);
  }
  if (command === "create-worktrees") {
    return cmdCreateWorktrees(args);
  }
  if (command === "merge-worktree") {
    return cmdMergeWorktree(args);
  }
  if (command === "write-report") {
    return cmdWriteReport(args);
  }
  if (command === "review-prd") {
    return cmdReviewPrd(args);
  }
  if (command === "mark-done") {
    return cmdMarkDone(args);
  }
  if (command === "check-complete") {
    return cmdCheckComplete(args);
  }

  throw new UsageError(`unknown command: ${command}\n${usage()}`);
}

export function main(argv = process.argv.slice(2)) {
  try {
    return dispatch(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 1;
    }
    if (error instanceof ToolError) {
      emit({ error: error.message, status: "ERROR" }, false);
      return 1;
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = main();
}
