# Agents

## Workflow

Whenever a change is made to the codebase, always run the end-to-end tests at the end to verify nothing is broken:

```bash
npm test
```

If the project is not yet set up, run `npm install` first.

When a GitHub URL is pasted, use `gh` CLI (e.g., `gh issue view`, `gh pr view`) to access it instead of webfetch.

## Testing

- **Framework**: Playwright
- **Command**: `npm test`
- **Config**: `playwright.config.js`
- **Tests**: `tests/`
- **CI**: GitHub Actions (`.github/workflows/e2e.yml`)

Tests start a local dev server automatically, no manual server startup needed.
