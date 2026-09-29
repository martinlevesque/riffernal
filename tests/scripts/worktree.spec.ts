import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureWorktree,
  parseWorktrees,
  sanitizeDirName,
  worktreeDirFor,
} from "../../scripts/worktree.ts";

let repoDir: string;

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), "worktree-spec-"));

  const git = (args: string[]) => {
    const p = Bun.spawnSync(["git", "-C", repoDir, ...args]);
    if (p.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${p.stderr.toString().trim()}`);

    return p;
  };

  git(["init", "--initial-branch=master", "--quiet"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  writeFileSync(join(repoDir, "README.md"), "# test\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "init"]);
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

test("parseWorktrees reads porcelain entries", () => {
  const entries = parseWorktrees(
    [
      "worktree /repo",
      "HEAD 6818c967",
      "branch refs/heads/master",
      "",
      "worktree /repo-wt/fix-loops",
      "HEAD 8e69ccc",
      "branch refs/heads/fix/loops-display",
      "",
    ].join("\n")
  );

  expect(entries).toEqual([
    { path: "/repo", branch: "master" },
    { path: "/repo-wt/fix-loops", branch: "fix/loops-display" },
  ]);
});

test("parseWorktrees keeps the main worktree when it is detached", () => {
  const entries = parseWorktrees(["worktree /repo", "HEAD 6818c967", ""].join("\n"));

  expect(entries).toEqual([{ path: "/repo" }]);
});

test("sanitizeDirName collapses unsafe and whitespace characters", () => {
  expect(sanitizeDirName("fix/show-keys-only-when-no-keyboard")).toBe(
    "fix-show-keys-only-when-no-keyboard"
  );
  expect(sanitizeDirName("feat/a b<>c")).toBe("feat-a-b-c");
});

test("sanitizeDirName trims leading and trailing dots", () => {
  expect(sanitizeDirName(".hidden.")).toBe("hidden");
});

test("sanitizeDirName collapses multi-slash branches into one dash", () => {
  expect(sanitizeDirName("feat//double-slash")).toBe("feat-double-slash");
});

test("worktreeDirFor nests under a sibling <repo>-worktrees folder", () => {
  expect(worktreeDirFor("/home/martin/works/riffernal", "fix/170-show-keys")).toBe(
    "/home/martin/works/riffernal-worktrees/fix-170-show-keys"
  );
});

test("ensureWorktree creates a new worktree for a new branch", () => {
  const { path, created } = ensureWorktree("feat/agent-test-a", repoDir);

  expect(created).toBe(true);
  // A fresh branch with no commits yet starts where master does.
  const head = Bun.spawnSync(["git", "-C", path, "rev-parse", "master", "HEAD"]);
  const [expected, actual] = head.stdout.toString().trim().split("\n");

  expect(actual).toBe(expected);
});

test("ensureWorktree reuses an existing branch's worktree", () => {
  const first = ensureWorktree("feat/agent-test-b", repoDir);
  const second = ensureWorktree("feat/agent-test-b", repoDir);

  expect(first.created).toBe(true);
  expect(second.created).toBe(false);
  expect(second.path).toBe(first.path);
});

test("ensureWorktree checks out an existing local branch", () => {
  Bun.spawnSync(["git", "-C", repoDir, "branch", "existing-branch"]);

  const { path, created } = ensureWorktree("existing-branch", repoDir);

  expect(created).toBe(true);
  const branch = Bun.spawnSync(["git", "-C", path, "branch", "--show-current"]);

  expect(branch.stdout.toString().trim()).toBe("existing-branch");
});

test("worktree folders land in the sibling -worktrees layout", () => {
  const { path } = ensureWorktree("feat/agent-test-c", repoDir);

  expect(path.startsWith(`${repoDir}-worktrees${join("/", "")}`)).toBe(true);
});

test("ensureWorktree fails outside a git repository", () => {
  const notARepo = mkdtempSync(join(tmpdir(), "no-git-"));

  try {
    expect(() => ensureWorktree("any-branch", notARepo)).toThrow();
  } finally {
    rmSync(notARepo, { recursive: true, force: true });
  }
});
