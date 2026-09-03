# Agents

## Workflow

Whenever a change is made to the codebase, verify nothing is broken before finishing:

```bash
bun run lint
bun run typecheck
```

Then re-run the tests that cover the change: the changed file's **own test
suite plus its parent suite** — see "What to re-run after a change" under
Testing. Run the full `bun run test` only when the parent suite is the full
suite or the change is cross-cutting.

If the project is not yet set up, run `bun install` first.

When a GitHub URL is pasted, use `gh` CLI (e.g., `gh issue view`, `gh pr view`) to access it instead of webfetch.

## Testing

- **Framework**: Playwright
- **Command**: `bun run test`
- **Config**: `playwright.config.ts`
- **Tests**: `tests/` — two projects: `api` (`tests/api/**`) and `e2e` (all other specs, browser-driven)
- **Unit tests**: `bun run test:unit` (`tests/api/helpers/`)
- **CI**: GitHub Actions (`.github/workflows/e2e.yml`)

Tests start a local dev server automatically, no manual server startup needed.

### What to re-run after a change

After changing a `.ts` file, re-run its **own suite** (the specs directly
covering it) plus its **parent suite** (the next enclosing suite). When the
parent is the full suite, run the full suite once — it already includes the
own suite. Targeted invocations:

```bash
bun x playwright test --project=api tests/api/song.spec.ts  # one spec
bun x playwright test --project=api                          # one project
bun run test                                                 # full suite
```

| Changed file | Re-run |
| --- | --- |
| `backend/api/<name>.ts` | `tests/api/<name>.spec.ts`, then the `api` project |
| `backend/models/<name>.ts` | the `tests/api/*.spec.ts` files exercising it (grep for its exports), then the `api` project |
| `tests/api/<name>.spec.ts` | the `api` project (it includes the spec) |
| `tests/api/helpers/*.spec.ts` | `bun run test:unit` |
| `frontend/src/**` | the e2e specs covering the module (grep `tests/` for the feature) as a quick check, then the full suite |
| `tests/<name>.spec.ts` (e2e) | the full suite (it includes the spec) |
| `backend/api.ts`, `backend/api/router.ts`, `backend/api/middleware.ts`, `backend/api/index.ts`, `backend/models/index.ts`, `backend/db/**`, `tests/helpers/**`, `tests/global-setup.mts`, `scripts/**`, `playwright.config.ts` | full suite |

Comment-only changes need only `bun run lint` and `bun run typecheck`. When
you can't tell which specs cover a file, grep `tests/` for its exported
names or feature; if still unsure, run the full suite.

The full Playwright suite is slow — plan for **7–8 minutes** end-to-end
(startup + browser boots + all specs). When invoking `bun run test`:

- **Run it in the background** and poll for completion in a loop — do
  not block a single long tool call, and do not kill it early. The
  shell tool caps individual commands well below the full runtime.
  Example pattern:
  ```bash
  nohup bun run test > /tmp/opencode/test-run.log 2>&1 &
  TEST_PID=$!
  ```
  Then poll every ~10–30s with `kill -0 $TEST_PID` until it exits, and
  `tail /tmp/opencode/test-run.log` for the summary line.
- If a prior `bun run dev` is holding port 3000, stop it first
  (`bun run dev:stop`) so Playwright's `webServer` can boot cleanly.

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
- Comments must not repeat what the code already expresses. Add them rarely —
  only when they contribute something the code doesn't define (the reasoning
  behind a magic value, a platform quirk, a non-obvious constraint)
- Do not reference issue numbers (e.g., `#86`, `issue #88`) in source code,
  comments, or test names — use the PR/commit title or git log for traceability
  instead of tying the code to a GitHub issue

## Architecture

The backend follows a Rails-MVC-inspired layering with a strict call
direction: `api/ → models/ → db/`. Each layer only talks to the one
below it; `db/` never imports from `models/`, and `api/` never imports
from `db/` directly.

- `backend/api/` — **controllers** (HTTP layer: request parsing,
  response shaping, status codes). Controllers call `models/` only.
- `backend/models/` — **domain models**: invariants, domain types,
  DTO shaping, and orchestration across one or more persistence
  modules. The model layer owns business rules (e.g. `isBestScoreValid`,
  "title cannot be empty", game-settings merge) and exposes
  domain-shaped DTOs (`SongSummary`, `SongFull`, `Category`...) to the
  controllers. Models call `db/` only.
- `backend/db/` — **persistence** (SQL queries, row types, storage
  primitives). No domain rules live here — `db/` returns raw rows and
  leaves the interpretation to `models/`.

The frontend is a SPA view layer that consumes the backend API. It does
**not** have a `models/` folder (models are a backend concept).
Presentation-side domain helpers live in their domain module (e.g.
`frontend/src/game/scoring.ts`), not in a generic `utils/` grab-bag.
Generic, framework-agnostic helpers (e.g. `clamp`, `formatTime`,
`noteNameToMidi`) stay in `frontend/src/utils/helpers.ts`.
