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

- Source code in `frontend/src/`
- Compiled output to `dist/` (via `bun run build`, gitignored)
  - JS: `dist/js/` (from tsc)
  - Static assets copied from `frontend/`: `dist/index.html`, `dist/css/`, `dist/assets/`
- Run `bun run typecheck` to type-check without emitting

## Linting

- **Tool**: Biome
- **Command**: `bun run lint`
- **Config**: `biome.json`
- **CI**: GitHub Actions (`.github/workflows/lint.yml`)
- **Auto-fix**: `bun run lint:fix`
- **Format**: `bun run format` (check) / `bun run format:fix` (write)
- `noNonNullAssertion` is disabled (idiomatic `getElementById!` DOM pattern)
- `noExplicitAny` is disabled in `tests/` (browser-side dynamic imports)
