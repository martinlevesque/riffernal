import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

type ExistingWorktree = { path: string; branch?: string };

function git(args: string[], cwd: string): string {
  const { status, stdout, stderr } = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
  });

  if (status !== 0) {
    const detail = (stderr || stdout || "").trim() || `git ${args.join(" ")} failed`;
    throw new Error(detail);
  }

  return (stdout || "").trim();
}

function refExists(repoDir: string, ref: string): boolean {
  const { status } = spawnSync("git", ["-C", repoDir, "show-ref", "--verify", "--quiet", ref], {
    stdio: "ignore",
  });

  return status === 0;
}

/** Map `git worktree list --porcelain` output to its entries. */
export function parseWorktrees(porcelain: string): ExistingWorktree[] {
  const entries: ExistingWorktree[] = [];

  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      entries.push({ path: line.slice("worktree ".length) });
    } else if (line.startsWith("branch refs/heads/") && entries.length > 0) {
      entries[entries.length - 1].branch = line.slice("branch refs/heads/".length);
    }
  }

  return entries;
}

/** Derive the folder name a branch's worktree is checked out into.
 *  Windows-unsafe characters collapse to dashes so the layout works on
 *  any platform. */
export function sanitizeDirName(branch: string): string {
  return branch
    .replace(/[<>:"/\\|?*\s]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

/** Worktrees live in a sibling folder of the main checkout, e.g.
 *  `../<repo>-worktrees/<branch>` — outside the main tree, where neither
 *  builds nor test globs pick them up. */
export function worktreeDirFor(mainRoot: string, branch: string): string {
  const dirName = sanitizeDirName(branch);

  return join(dirname(mainRoot), `${basename(mainRoot)}-worktrees`, dirName);
}

/** Reuse an existing worktree for `branch`, or check the branch out into
 *  a new one beside the main repository. Returns the worktree path and
 *  whether it was just created. */
export function ensureWorktree(branch: string, cwd: string): { path: string; created: boolean } {
  const existing = parseWorktrees(git(["worktree", "list", "--porcelain"], cwd));
  const mainRoot = existing[0]?.path;

  if (!mainRoot) throw new Error("Not inside a git repository.");

  const already = existing.find((worktree) => worktree.branch === branch);

  if (already) return { path: already.path, created: false };

  const dir = worktreeDirFor(mainRoot, branch);
  mkdirSync(dirname(dir), { recursive: true });

  // A branch that exists locally or on origin is checked out as-is (git
  // auto-creates a tracking branch for the origin form); anything else
  // starts a new branch off master. Make cannot cd the caller's shell,
  // so the printed path is how the user gets there.
  if (refExists(cwd, `refs/heads/${branch}`) || refExists(cwd, `refs/remotes/origin/${branch}`)) {
    git(["worktree", "add", dir, branch], cwd);
  } else {
    const base = ["refs/heads/master", "refs/remotes/origin/master"].find((ref) =>
      refExists(cwd, ref)
    );

    git(["worktree", "add", "-b", branch, dir, base ?? "HEAD"], cwd);
  }

  return { path: dir, created: true };
}

if (import.meta.main) {
  const branch = process.argv[2];

  if (!branch) {
    console.error("Usage: bun run scripts/worktree.ts <branch>");
    process.exit(1);
  }

  try {
    const { path, created } = ensureWorktree(branch, process.cwd());
    console.log(
      created ? `Worktree for '${branch}' created → ${path}` : `Worktree for '${branch}' → ${path}`
    );
    console.log("");
    console.log(`cd ${path}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
