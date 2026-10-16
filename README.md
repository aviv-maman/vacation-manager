# Vacation Manager

A vacation request management assignment, built step by step.

## Current milestone: establish the project baseline

`frontend/` contains the original Vue scaffold with its generated dependency versions. It includes Vue, TypeScript, Vite, Vue Router, Vitest, ESLint, Oxlint, and Prettier. `backend/` is a placeholder for the next milestone. Application screens, API handlers, authentication, and database setup will be implemented in later steps.

The planned backend stack is Node.js with Common Event Framework, PostgreSQL, and TypeORM. The frontend will use Axios and Tailwind CSS when those steps begin.

```text
vacation-manager/
  frontend/                       Vue scaffold
  backend/                        Placeholder
  .vscode/                        Repository editor settings
  vacation-manager.code-workspace VS Code workspace
  README.md
```

## Prerequisites

- Node.js 24.12 or newer is recommended; the scaffold also supports Node 22.18+ within version 22.
- npm (included with Node.js).
- Git.

## Install and run

From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. The page currently displays the scaffold's welcome message.

If PowerShell blocks `npm.ps1`, use `npm.cmd` for the same commands.

## Verify the baseline

Run these commands from `frontend/`:

```sh
npm run build
npm run test:unit -- --run
npm run lint
```

The build runs Vue TypeScript checking and generates ignored output in `frontend/dist/`. The test is the scaffold's example component test. The scaffold's lint command can apply fixes.

## VS Code

Open `vacation-manager.code-workspace`. The repository settings disable experimental tsgo for Vue tooling compatibility and recommend the Vue Official extension. After changing language-service settings, run **Developer: Reload Window**.

Dependency folders, build output, caches, and local environment files are ignored by Git.
