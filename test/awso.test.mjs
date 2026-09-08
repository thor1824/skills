import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cli = path.resolve("scripts/awso/awso.mjs");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, ...args) {
  const result = run("git", args, cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function invoke(cwd, ...args) {
  return run(process.execPath, [cli, ...args], cwd);
}

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "awso-test-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const main = path.join(parent, "main");
  fs.mkdirSync(main);
  git(main, "init", "-b", "main");
  git(main, "config", "user.name", "AWSO Test");
  git(main, "config", "user.email", "awso@example.invalid");
  fs.writeFileSync(path.join(main, "AGENTS.md"), "# Project instructions\n");
  git(main, "add", "AGENTS.md");
  git(main, "commit", "-m", "initial");
  return { parent, main };
}

test("help describes every command without requiring a repository", () => {
  const result = invoke(process.cwd(), "help");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Usage: awso <command>/);
  for (const command of ["setup", "update", "add", "restore", "status", "help"]) {
    assert.match(result.stdout, new RegExp(`^  ${command}\\s`, "m"));
  }
  assert.match(result.stdout, /^  add <folder>$/m);
  assert.equal(invoke(process.cwd(), "add").status, 3);
});

test("setup is idempotent and preserves personal instructions", (t) => {
  const { main } = fixture(t);
  const first = invoke(main, "setup");
  assert.equal(first.status, 0, first.stderr);
  const extension = path.join(main, ".agent-workspaces", "sources", "AGENTS.extend.md");
  const ignoreFile = path.join(main, ".agent-workspaces", "overlay", ".awsoignore");
  assert.match(fs.readFileSync(ignoreFile, "utf8"), /not linked/);
  fs.writeFileSync(extension, "# Mine\n\n- Keep this.\n");
  fs.writeFileSync(ignoreFile, "skill-lock.json\n");

  const second = invoke(main, "setup");
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(extension, "utf8"), "# Mine\n\n- Keep this.\n");
  assert.equal(fs.readFileSync(ignoreFile, "utf8"), "skill-lock.json\n");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(main, ".agent-workspaces", "manifest.json"))), { version: 1, files: [] });
  const exclude = fs.readFileSync(path.join(main, ".git", "info", "exclude"), "utf8");
  assert.equal((exclude.match(/# >>> awso/g) || []).length, 1);
  assert.match(exclude, /\/\.agent-workspaces\//);
  assert.match(exclude, /\/AGENTS\.override\.md/);
});

test(".awsoignore keeps matching overlay files out of worktrees", (t) => {
  const { parent, main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const overlay = path.join(main, ".agent-workspaces", "overlay");
  fs.writeFileSync(path.join(overlay, ".awsoignore"), [
    "# Local overlay metadata",
    "skill-lock.json",
    "**/skill-lock.yaml",
    "cache/",
    "*.tmp",
    "!important.tmp",
    "draft[0-9].txt",
    "secret?.txt",
    "/root-only",
    "",
  ].join("\n"));
  fs.mkdirSync(path.join(overlay, "nested"));
  fs.mkdirSync(path.join(overlay, "cache"));
  fs.writeFileSync(path.join(overlay, "skill-lock.json"), "{}\n");
  fs.writeFileSync(path.join(overlay, "nested", "skill-lock.json"), "{}\n");
  fs.writeFileSync(path.join(overlay, "nested", "skill-lock.yaml"), "lock: true\n");
  fs.writeFileSync(path.join(overlay, "cache", "state.json"), "{}\n");
  fs.writeFileSync(path.join(overlay, "scratch.tmp"), "temporary\n");
  fs.writeFileSync(path.join(overlay, "important.tmp"), "keep\n");
  fs.writeFileSync(path.join(overlay, "draft7.txt"), "local\n");
  fs.writeFileSync(path.join(overlay, "draftx.txt"), "keep\n");
  fs.writeFileSync(path.join(overlay, "secret1.txt"), "local\n");
  fs.writeFileSync(path.join(overlay, "secret12.txt"), "keep\n");
  fs.writeFileSync(path.join(overlay, "root-only"), "local\n");
  fs.writeFileSync(path.join(overlay, "nested", "root-only"), "keep\n");
  fs.writeFileSync(path.join(overlay, "kept.txt"), "keep\n");

  const updated = invoke(main, "update");
  assert.equal(updated.status, 0, updated.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(main, ".agent-workspaces", "manifest.json")));
  assert.deepEqual(manifest.files, ["draftx.txt", "important.tmp", "kept.txt", "nested/root-only", "secret12.txt"]);

  const linked = path.join(parent, "ignored-files-worktree");
  git(main, "worktree", "add", "-b", "ignored-files", linked);
  const restored = invoke(linked, "restore");
  assert.equal(restored.status, 0, restored.stderr);
  for (const relative of [
    ".awsoignore",
    "skill-lock.json",
    "nested/skill-lock.json",
    "nested/skill-lock.yaml",
    "cache/state.json",
    "scratch.tmp",
    "draft7.txt",
    "secret1.txt",
    "root-only",
  ]) {
    assert.equal(fs.existsSync(path.join(linked, relative)), false, `${relative} should not be restored`);
  }
  for (const relative of manifest.files) assert.equal(fs.lstatSync(path.join(linked, relative)).isSymbolicLink(), true);
});

test("skills are restored as directory symlinks and legacy file links are migrated", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const overlay = path.join(main, ".agent-workspaces", "overlay");
  const skill = path.join(overlay, ".agents", "skills", "demo");
  fs.mkdirSync(path.join(skill, "references"), { recursive: true });
  fs.writeFileSync(path.join(skill, "SKILL.md"), "# Demo\n");
  fs.writeFileSync(path.join(skill, "references", "notes.md"), "Notes\n");
  fs.writeFileSync(path.join(overlay, ".agents", "skills", "skill-lock.json"), "{}\n");
  fs.writeFileSync(path.join(overlay, ".awsoignore"), "skill-lock.json\n");

  const manifestFile = path.join(main, ".agent-workspaces", "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    version: 1,
    files: [".agents/skills/demo/SKILL.md", ".agents/skills/demo/references/notes.md"],
  }, null, 2)}\n`);
  assert.equal(invoke(main, "restore").status, 0);
  const destination = path.join(main, ".agents", "skills", "demo");
  assert.equal(fs.lstatSync(destination).isDirectory(), true);
  assert.equal(fs.lstatSync(path.join(destination, "SKILL.md")).isSymbolicLink(), true);

  const updated = invoke(main, "update");
  assert.equal(updated.status, 0, updated.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile)).files, [".agents/skills/demo"]);
  const restored = invoke(main, "restore");
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(destination), skill);
  assert.equal(fs.readFileSync(path.join(destination, "references", "notes.md"), "utf8"), "Notes\n");
  assert.equal(fs.existsSync(path.join(main, ".agents", "skills", "skill-lock.json")), false);
  assert.equal(invoke(main, "status").status, 0);
});

test("add stores an entire overlay folder as one persistent manifest entry", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const overlay = path.join(main, ".agent-workspaces", "overlay");
  const source = path.join(overlay, ".config", "tool");
  fs.mkdirSync(path.join(source, "nested"), { recursive: true });
  fs.writeFileSync(path.join(source, "config.json"), "{}\n");
  fs.writeFileSync(path.join(source, "nested", "state.json"), "{}\n");
  assert.equal(invoke(main, "update").status, 0);
  assert.equal(invoke(main, "restore").status, 0);
  const destination = path.join(main, ".config", "tool");
  assert.equal(fs.lstatSync(destination).isDirectory(), true);

  const added = invoke(main, "add", ".config/tool");
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /Added overlay directory to manifest/);
  const manifestFile = path.join(main, ".agent-workspaces", "manifest.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, "utf8")).files, [".config/tool"]);

  const restored = invoke(main, "restore");
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(destination), source);
  assert.equal(invoke(main, "update").status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, "utf8")).files, [".config/tool"]);
  assert.equal(invoke(main, "status").status, 0);
});

test("add rejects folders excluded by .awsoignore", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const overlay = path.join(main, ".agent-workspaces", "overlay");
  fs.mkdirSync(path.join(overlay, "cache"));
  fs.writeFileSync(path.join(overlay, "cache", "state.json"), "{}\n");
  fs.writeFileSync(path.join(overlay, ".awsoignore"), "cache/\n");

  const result = invoke(main, "add", "cache");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /ignored by \.awsoignore/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(main, ".agent-workspaces", "manifest.json"), "utf8")).files, []);
});

test("restore does not replace a foreign skill directory", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const skill = path.join(main, ".agent-workspaces", "overlay", ".agents", "skills", "demo");
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, "SKILL.md"), "# Demo\n");
  assert.equal(invoke(main, "update").status, 0);

  const destination = path.join(main, ".agents", "skills", "demo");
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "mine.txt"), "mine\n");
  const restored = invoke(main, "restore");
  assert.equal(restored.status, 3);
  assert.equal(fs.readFileSync(path.join(destination, "mine.txt"), "utf8"), "mine\n");
});

test("update rejects tracked files beneath a skill directory", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const overlaySkill = path.join(main, ".agent-workspaces", "overlay", ".agents", "skills", "demo");
  fs.mkdirSync(overlaySkill, { recursive: true });
  fs.writeFileSync(path.join(overlaySkill, "SKILL.md"), "# Personal demo\n");
  const trackedSkill = path.join(main, ".agents", "skills", "demo");
  fs.mkdirSync(trackedSkill, { recursive: true });
  fs.writeFileSync(path.join(trackedSkill, "README.md"), "Repository skill\n");
  git(main, "add", ".agents/skills/demo/README.md");
  git(main, "commit", "-m", "track repository skill");

  const result = invoke(main, "update");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /tracked repository files/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(main, ".agent-workspaces", "manifest.json"))).files, []);
});

test("update inventories files and restore hydrates linked worktrees", (t) => {
  const { parent, main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const overlay = path.join(main, ".agent-workspaces", "overlay");
  fs.mkdirSync(path.join(overlay, ".codex", "hooks"), { recursive: true });
  fs.writeFileSync(path.join(overlay, ".codex", "hooks", "before-test"), "#!/bin/sh\n");
  fs.mkdirSync(path.join(overlay, ".my-agent"), { recursive: true });
  fs.writeFileSync(path.join(overlay, ".my-agent", "config.json"), "{}\n");

  const updated = invoke(main, "update");
  assert.equal(updated.status, 0, updated.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(main, ".agent-workspaces", "manifest.json")));
  assert.deepEqual(manifest.files, [".codex/hooks/before-test", ".my-agent/config.json"]);

  const linked = path.join(parent, "feature worktree");
  git(main, "worktree", "add", "-b", "feature", linked);
  const restored = invoke(linked, "restore");
  assert.equal(restored.status, 0, restored.stderr);
  const hook = path.join(linked, ".codex", "hooks", "before-test");
  assert.equal(fs.lstatSync(hook).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(hook), path.join(overlay, ".codex", "hooks", "before-test"));
  assert.match(fs.readFileSync(path.join(linked, "AGENTS.override.md"), "utf8"), /GENERATED BY awso/);
  assert.equal(invoke(linked, "status").status, 0);

  fs.writeFileSync(path.join(linked, "AGENTS.md"), "# Branch instructions\n");
  assert.equal(invoke(linked, "status").status, 1);
  assert.equal(invoke(linked, "restore").status, 0);
  assert.match(fs.readFileSync(path.join(linked, "AGENTS.override.md"), "utf8"), /Branch instructions/);
});

test("update rejects tracked destinations without changing the manifest", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  fs.mkdirSync(path.join(main, ".codex"));
  fs.writeFileSync(path.join(main, ".codex", "config.toml"), "project = true\n");
  git(main, "add", ".codex/config.toml");
  git(main, "commit", "-m", "track project config");
  const overlayFile = path.join(main, ".agent-workspaces", "overlay", ".codex", "config.toml");
  fs.mkdirSync(path.dirname(overlayFile), { recursive: true });
  fs.writeFileSync(overlayFile, "personal = true\n");
  const manifestFile = path.join(main, ".agent-workspaces", "manifest.json");
  const before = fs.readFileSync(manifestFile, "utf8");

  const result = invoke(main, "update");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /conflict/i);
  assert.equal(fs.readFileSync(manifestFile, "utf8"), before);
});

test("restore leaves foreign files and foreign symlinks untouched", (t) => {
  const { parent, main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const source = path.join(main, ".agent-workspaces", "overlay", "personal", "config");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "canonical\n");
  assert.equal(invoke(main, "update").status, 0);

  const linked = path.join(parent, "linked");
  git(main, "worktree", "add", "-b", "foreign", linked);
  const destination = path.join(linked, "personal", "config");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, "mine\n");
  const result = invoke(linked, "restore");
  assert.equal(result.status, 3);
  assert.equal(fs.readFileSync(destination, "utf8"), "mine\n");

  fs.rmSync(destination);
  const other = path.join(parent, "other");
  fs.writeFileSync(other, "other\n");
  fs.symlinkSync(other, destination);
  const symlinkResult = invoke(linked, "restore");
  assert.equal(symlinkResult.status, 3);
  assert.equal(fs.readlinkSync(destination), other);
});

test("status is read-only", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const before = git(main, "status", "--porcelain=v1", "--ignored");
  const override = path.join(main, "AGENTS.override.md");
  assert.equal(fs.existsSync(override), false);
  const result = invoke(main, "status");
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(override), false);
  assert.equal(git(main, "status", "--porcelain=v1", "--ignored"), before);
});

test("status requests update when overlay contents diverge from the manifest", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const source = path.join(main, ".agent-workspaces", "overlay", "new-file");
  fs.writeFileSync(source, "new\n");
  const result = invoke(main, "status");
  assert.equal(result.status, 2);
  assert.match(result.stdout, /update required/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(main, ".agent-workspaces", "manifest.json"))).files.length, 0);
});

test("restore always replaces AGENTS.override.md", (t) => {
  const { parent, main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const override = path.join(main, "AGENTS.override.md");
  fs.writeFileSync(override, "repository owned\n");
  git(main, "add", "-f", "AGENTS.override.md");
  git(main, "commit", "-m", "track override");

  assert.equal(invoke(main, "status").status, 1);
  const result = invoke(main, "restore");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AGENTS\.override\.md:\n  regenerated/);
  assert.match(fs.readFileSync(override, "utf8"), /GENERATED BY awso/);
  assert.match(fs.readFileSync(override, "utf8"), /Project instructions/);
  assert.equal(invoke(main, "status").status, 0);

  const other = path.join(parent, "foreign-override");
  fs.writeFileSync(other, "foreign\n");
  fs.unlinkSync(override);
  fs.symlinkSync(other, override);
  const symlinkResult = invoke(main, "restore");
  assert.equal(symlinkResult.status, 0, symlinkResult.stderr);
  assert.equal(fs.lstatSync(override).isFile(), true);
  assert.match(fs.readFileSync(override, "utf8"), /GENERATED BY awso/);
  assert.equal(fs.readFileSync(other, "utf8"), "foreign\n");
});

test("update rejects broken source symlinks", (t) => {
  const { main } = fixture(t);
  assert.equal(invoke(main, "setup").status, 0);
  const link = path.join(main, ".agent-workspaces", "overlay", "broken-link");
  fs.symlinkSync(path.join(main, "does-not-exist"), link);
  const result = invoke(main, "update");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /Broken overlay source symlink/);
});
