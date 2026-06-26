# Agents

## Workflow

Whenever a change is made to the codebase, always run the end-to-end tests at the end to verify nothing is broken:

```bash
bun run lint
bun run typecheck
bun run test
```

If the project is not yet set up, run `bun install` first.

When a GitHub URL is pasted, use `gh` CLI (e.g., `gh issue view`, `gh pr view`) to access it instead of webfetch.

## Testing

- **Framework**: Playwright
- **Command**: `bun run test`
- **Config**: `playwright.config.ts`
- **Tests**: `tests/`
- **CI**: GitHub Actions (`.github/workflows/e2e.yml`)

Tests start a local dev server automatically, no manual server startup needed.

## TypeScript

- Source code in `frontend/src/` (`.ts` files, imports use `.js` extensions)
- Dev server transpiles TS on the fly via `Bun.Transpiler` — no separate compile step
- Production build (`bun run build`) transpiles to `dist/js/` via `Bun.Transpiler`
- Static assets copied from `frontend/`: `dist/index.html`, `dist/css/`, `dist/assets/`
- `dist/` is gitignored
- Run `bun run typecheck` (`tsc --noEmit`) to type-check without emitting

## Linting

- **Tool**: Biome
- **Command**: `bun run lint`
- **Config**: `biome.json`
- **CI**: GitHub Actions (`.github/workflows/lint.yml`)
- **Auto-fix**: `bun run lint:fix`
- **Format**: `bun run format` (check) / `bun run format:fix` (write)
- `noNonNullAssertion` is disabled (idiomatic `getElementById!` DOM pattern)
- `noExplicitAny` is disabled in `tests/` (browser-side dynamic imports)

## Code Style

- Always add a blank line before and after `if`, `else`, `for`, and `while` statements
- Never leave `catch` blocks empty — at least log the error (e.g., `console.error(err)`)
