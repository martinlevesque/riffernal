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

- **Framework**: Playwright (e2e + API) / bun:test (unit)
- **Command**: `bun run test` (full Playwright suite)
- **Config**: `playwright.config.ts`
- **Unit tests**: `bun run test:unit`

### Test folder structure

Test files mirror the source tree they exercise:

```
tests/
├── backend/              ← mirrors backend/
│   ├── api/              ← API endpoint tests (Playwright --project=api)
│   │   ├── helpers/      ← API helper unit tests (bun:test)
│   │   └── *.spec.ts
│   └── db/               ← DB layer unit tests (bun:test)
│       └── *.spec.ts
├── frontend/             ← mirrors frontend/src/
│   └── src/
│       └── utils/
│           └── *.spec.ts ← unit tests (bun:test)
├── e2e/                  ← browser E2E tests (Playwright --project=e2e)
│   └── *.spec.ts
└── helpers/              ← shared test helpers (used by both api + e2e)
    ├── api.ts
    ├── page/
    └── ...
```

**Rule**: place a test file at the same relative path under `tests/` as the
source file it tests lives under `backend/` or `frontend/src/`. E2E tests
that don't target a specific source file go in `tests/e2e/`. Shared test
utilities (auth helpers, page objects, seed functions) stay in `tests/helpers/`.

### Playwright projects

| Project | `testDir` | Description |
| --- | --- | --- |
| `api` | `tests/backend/api` | API endpoint tests (excludes `helpers/`) |
| `e2e` | `tests/e2e` | Browser-driven end-to-end tests |

CI: GitHub Actions (`.github/workflows/e2e.yml`)

Tests start a local dev server automatically, no manual server startup needed.

### What to re-run after a change

After changing a `.ts` file, re-run its **own suite** (the specs directly
covering it) plus its **parent suite** (the next enclosing suite). When the
parent is the full suite, run the full suite once — it already includes the
own suite. Targeted invocations:

```bash
bun x playwright test --project=api tests/backend/api/song.spec.ts  # one spec
bun x playwright test --project=api                                  # one project
bun run test                                                         # full suite
```

| Changed file | Re-run |
| --- | --- |
| `backend/api/<name>.ts` | `tests/backend/api/<name>.spec.ts`, then the `api` project |
| `backend/models/<name>.ts` | the `tests/backend/api/*.spec.ts` files exercising it (grep for its exports), then the `api` project |
| `backend/db/<name>.ts` | `tests/backend/db/<name>.spec.ts` if it exists, then `bun run test:unit` |
| `tests/backend/api/<name>.spec.ts` | the `api` project (it includes the spec) |
| `tests/backend/api/helpers/*.spec.ts`, `tests/backend/db/*.spec.ts`, `tests/frontend/**/*.spec.ts` | `bun run test:unit` |
| `frontend/src/**` | the e2e specs covering the module (grep `tests/e2e/` for the feature) as a quick check, then the full suite |
| `tests/e2e/<name>.spec.ts` | the full suite (it includes the spec) |
| `backend/api.ts`, `backend/api/router.ts`, `backend/api/middleware/**`, `backend/api/index.ts`, `backend/models/index.ts`, `backend/db/**`, `tests/helpers/**`, `tests/e2e/global-setup.mts`, `scripts/**`, `playwright.config.ts` | full suite |

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

### Concurrent runs (multiple bb threads)

The suite is safe to run from several threads at once — no coordination
needed:

- The test port is picked automatically: 3100, then the first free port
  above it (up to +24). The resolved port is shared with test workers
  through `RIFFERNAL_TEST_PORT`, so specs' raw `node:http` helpers and
  the webServer always agree. Don't hardcode 3100 anywhere.
- The Playwright test server is `scripts/test-server.ts` — deliberately
  a separate entry point from `scripts/dev.ts`, because `dev:stop` kills
  the listener on port 3000 and must never take down other threads'
  test servers.
- For manual `bun run dev` while another thread is working, pass
  `--port <n>` (or `PORT=<n>`) so you don't contend for port 3000;
  `dev:stop` only ever kills the port-3000 listener.

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
- Comments must not repeat what the code already expresses. Only comment
  what the source doesn't already convey (the reasoning behind a magic
  value, a platform quirk, a non-obvious constraint). Keep them short —
  avoid verbose comments and doc blocks that restate parameters, types, or
  behavior visible from the signature/code itself.
- Do not reference issue numbers (e.g., `#86`, `issue #88`) in source code,
  comments, or test names — use the PR/commit title or git log for traceability
  instead of tying the code to a GitHub issue

## Styling

- **Pixel design language**: `frontend/css/pixel.css` holds the shared
  primitives (`.pixel-box`, `.pixel-box-inset`, `.pixel-btn`) — reuse them
  for new components instead of re-styling borders/shadows per component.
- **Font sizes**: always use the type-scale tokens defined in
  `frontend/css/base.css` — never write a raw `rem` font-size:

  | Token | Value | Typical use |
  | --- | --- | --- |
  | `--fs-smallest` | `0.8rem` | dense metadata (leaderboard cells, tags) |
  | `--fs-smaller` | `0.9rem` | body/supporting text |
  | `--fs-small` | `1rem` | default text, inputs, kbd |
  | `--fs-medium` | `1.15rem` | HUD buttons, mono labels |
  | `--fs-large` | `1.35rem` | lead paragraphs, emphasis |
  | `--fs-xlarge` | `1.7rem` | section headings, big HUD numbers |
  | `--fs-xxlarge` | `2rem` | screen-level headings, banners |

  Pick the nearest token; only add a new one to `base.css` if no existing
  token fits, and keep the naming (`--fs-*`) and single-step increments.
  Exemptions: hero/display one-offs (`.title`, `.home-title`,
  `#result-grade`) and `clamp()`-responsive titles.

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
