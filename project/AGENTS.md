# Repository Guidelines

## Project Structure & Modules
- `src/` — TypeScript source.
  - `ui/` (Preact components, e.g., `App.tsx`, `components/*`).
  - `background/` (extension background logic, services, logging).
  - `content-scripts/` (DOM interaction and page injection).
  - `shared/` (types, shared utilities).
- `public/` — static assets.
- `dist/` — build output (generated).
- `tests/` — e2e tests (Playwright), prefer `tests/e2e/*.spec.ts`.
- `tools/` — helper scripts (`install.sh`, `run.sh`, `test.sh`).
- `docs/` — docs and guides.

## Build, Test, Run
- `npm run dev` — start Vite dev server for extension code.
- `npm run build` — type-check then build background and content bundles.
- `npm run build:test` — production build in test mode.
- `npm run preview` — preview built assets.
- `npm run lint` / `npm run format` — ESLint and Prettier.
- `npm test` — run Playwright tests. Helpers: `tools/run.sh`, `tools/test.sh`.

## Coding Style & Naming
- Language: TypeScript (strict). UI: Preact.
- Formatting: Prettier (2-space indent, 80 cols, single quotes).
- Linting: ESLint (`eslint:recommended`, TS, Preact). Fix warnings before PR.
- Naming: components `PascalCase` (files and symbols), hooks `useX`, other modules/files `camelCase` (e.g., `openRouterClient.ts`).
- Keep side-effect-free modules.

## Testing Guidelines
- Framework: Playwright (`@playwright/test`).
- Location: `tests/e2e` with `*.spec.ts` filenames.
- Write deterministic tests; avoid relying on live network.
- Run `npm run build:test && npm test` locally before opening a PR.

## Commits & PRs
- Commits: Prefer Conventional Commits (e.g., `feat(content-script): add toggle`).
- PRs: Include clear description, linked issues, test plan/steps, and screenshots for UI. All checks (build, lint, tests) must pass.

## Security & Config
- Secrets: never commit secrets; use `.env` (dotenv is available). `.gitignore` excludes common outputs.
- Browser context: target Chrome extension APIs (`@types/chrome`). Keep content scripts efficient; avoid blocking.

## Agent-Specific Instructions
[byterover-mcp]
- Always use byterover-retrieve-knowledge to gather related context before tasks.
- Always use byterover-store-knowledge to persist critical information after successful tasks.

## Agent Workflow
- Diagnose: retrieve context first (use `byterover-retrieve-knowledge`).
- Think: state assumptions, constraints, and desired outcome.
- Plan: outline steps (use the plan tool) before executing.
- Do: split into clear, small steps; patch code with `apply_patch` and run minimal checks per step.
- Fix: address issues surfaced during implementation or quick checks.
- Test: run `npm run build:test && npm test`; ensure lint passes (`npm run lint`).
- Commit: commit focused changes with Conventional Commit messages (e.g., `docs: update AGENTS.md with agent workflow`).
