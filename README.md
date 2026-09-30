# Riffernal

Keyboard Hero - Metal Edition. Play piano along to metal songs.

## Setup

```bash
git clone https://github.com/martinlevesque/riffernal.git
cd riffernal
bun install
```

## Development

Start the dev server (auto-compiles TypeScript and serves on port 3000):

```bash
bun run dev
```

Open http://localhost:3000.

## Worktrees

Check a branch out into a dedicated worktree next to the main repository:

```bash
make worktree branch=<branch>
```

Reuses the worktree if the branch is already checked out somewhere, and
prints the folder to `cd` into. Local and `origin/*` branches are checked
out as-is; any other name is created off `master`.

## Build

Compile TypeScript to JavaScript:

```bash
bun run build
```

## Test

Run Playwright end-to-end tests:

```bash
bun run test
```

## Type-check

```bash
bun run typecheck
```
