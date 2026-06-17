# Agents

## Workflow

Whenever a change is made to the codebase, always run the end-to-end tests at the end to verify nothing is broken:

```bash
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
