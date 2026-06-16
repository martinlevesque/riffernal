# Agents

## Workflow

Whenever a change is made to the codebase, always run the end-to-end tests at the end to verify nothing is broken:

```bash
npm test
```

If the project is not yet set up, run `npm install` first.

## Testing

- **Framework**: Playwright
- **Command**: `npm test`
- **Config**: `playwright.config.js`
- **Tests**: `tests/`
- **CI**: GitHub Actions (`.github/workflows/e2e.yml`)

Tests start a local dev server automatically, no manual server startup needed.
