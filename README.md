# Vacation Manager

A vacation request management assignment, built step by step.

## Current milestone: verify backend compatibility

`frontend/` contains the original Vue scaffold with its generated dependency versions. `backend/` now runs a minimal Common Event Framework (CEF) server, connects to PostgreSQL through TypeORM, and exposes a health endpoint for a local browser check.

Step 2 currently resolves CEF **1.0.19** and TypeORM **1.1.2**. Backend runtime dependencies use caret ranges; the lockfile and `npm ci` keep installations reproducible. The schema, migrations, and demo data belong to step 3. Authentication, vacation operations, and application screens will follow in later milestones. The frontend will use Axios and Tailwind CSS when those steps begin.

```text
vacation-manager/
  frontend/                       Vue scaffold
  backend/                        CEF server, TypeORM configuration, health route
  .vscode/                        Repository editor settings
  vacation-manager.code-workspace VS Code workspace
  README.md
```

## Prerequisites

- Node.js 24.15 or newer in the 24.x line, or Node.js 26 or newer. The locked frontend tooling requires this range; the project is currently checked with Node.js 24.21.
- npm (included with Node.js).
- Git.
- PostgreSQL, either an existing local instance or Docker for the temporary check below.

## Frontend

From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. The page currently displays the scaffold's welcome message.

If PowerShell blocks `npm.ps1`, use `npm.cmd` for the same commands.

## Backend and PostgreSQL

For this milestone, start a temporary local PostgreSQL container from any terminal:

```sh
docker run --rm --name vacation-manager-db-check --label project=vacation-manager --publish 127.0.0.1:5432:5432 --env POSTGRES_USER=vacation --env POSTGRES_PASSWORD=vacation_local --env POSTGRES_DB=vacation_manager --detach postgres:17-alpine
```

This is a disposable compatibility check. `--rm` removes the container when stopped, and there is no persistent volume. Step 3 will add Docker Compose with persistent storage. If PostgreSQL is already installed, use an existing empty database instead and set its connection URL in `backend/.env`; Docker is optional.

From `backend/`:

```sh
npm ci
```

Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`). The example contains only local demonstration credentials. Adjust `DATABASE_URL` if using another PostgreSQL instance. AWS Parameter Store stays disabled.

Then start the backend:

```sh
npm run dev
```

This generates the handler registry, checks TypeScript, builds the server, and starts it at `http://localhost:8888`. After editing backend source or `root.yaml`, restart this command to rebuild. `npm start` runs an existing build without rebuilding.

## Browser check for step 2

Open [http://localhost:8888/health](http://localhost:8888/health). The expected HTTP 200 response is:

```json
{
  "status": "ok",
  "database": "connected",
  "entityMappings": ["users"]
}
```

The request passes through CEF's local server, the route in `src/root.yaml`, and `getHealth`. That handler initializes a shared TypeORM connection pool and executes `SELECT 1` against PostgreSQL. `entityMappings` confirms that TypeORM loaded the entity metadata from the built bundle. It does not mean that the users table exists yet.

Also check [http://localhost:8888/not-found](http://localhost:8888/not-found): it should return HTTP 404 with `{"error":"Route not found"}`. The server root `/` is also intentionally unmapped at this stage. You can see HTTP status codes in your browser's Network panel.

To check the database failure path, stop only the temporary container:

```sh
docker stop vacation-manager-db-check
```

Refreshing `/health` should return HTTP 503 with `{"status":"error","database":"unavailable"}`, without database details or a stack trace. Run the earlier `docker run` command again, wait for PostgreSQL to accept connections, then refresh `/health`; it should return HTTP 200 without restarting the backend.

## Checks

Run these commands from `frontend/`:

```sh
npm run build
npm run test:unit -- --run
npm run lint
npm run format:check
```

The build runs Vue TypeScript checking and generates ignored output in `frontend/dist/`. The test is the scaffold's example component test. The scaffold's lint command can apply fixes.

From `backend/`:

```sh
npm run build
npm run lint
npm run format:check
```

Backend lint reports errors without modifying files. The database-backed HTTP check above is the integration verification for this milestone; business-rule tests will be added with those features.

## Formatting

The root `.prettierrc.json` sets semicolons, double quotes, and a 100-character print width for both projects. VS Code already formats files on save with Prettier.

From either `frontend/` or `backend/`, run `npm run format` to format the entire repository, including root configuration files. Before committing, run `npm run format:check`; it reports formatting differences without changing files and exits with an error if any file needs formatting. Both projects use the same pinned Prettier version. Generated output, dependency folders, lockfiles, and local environment files are excluded through the shared `.prettierignore`.

## Backend approach and current limitations

- The server started from CEF's `cef-init` scaffold. Routes live in `src/root.yaml`; `cef-gen-handlers` generates static handler imports, and `cef-build` bundles the server and copies the YAML into `dist/`. Generated files are ignored by Git and recreated during the build.
- CEF's local server is used directly. There is no Express server, AWS configuration, deployment, or deployment ZIP.
- Routes can use CEF's `x-inputParser` hook. The entry point passes parsed input to the handler or returns a parser's `Response` immediately. A configured parser that cannot be resolved returns a generic server error. The health route does not need an input parser.
- The `User` entity currently maps only its ID to verify decorator and entity loading. Step 3 will complete the entity and add the explicit migration. Both schema synchronization and automatic migration execution are disabled.
- Database column types are explicit so the CEF/esbuild bundle does not depend on inferred TypeScript decorator metadata. The TypeScript configuration uses legacy decorators for TypeORM.
- Application source targets ES2022, which CEF's bundled esbuild understands, with ES2023 library types. Node 24 provides the runtime support required by TypeORM 1.x; the source target does not lower the installed library's runtime requirements.
- Health checks share one TypeORM pool with a limit of five connections and five-second connection/query timeouts. Failed initialization can be retried on a later request.
- CEF's automatically added diagnostic routes are not exposed. Only the application health route is available in this milestone.
- `npm audit` currently reports nine vulnerable dependency entries (two high, seven moderate) in CEF's dependency tree. No forced dependency changes or framework downgrade have been applied; these remain a known dependency limitation to review.

References: [CEF package documentation](https://www.npmjs.com/package/commoneventframework?activeTab=readme), [TypeORM entities](https://typeorm.io/docs/entity/entities/), and [TypeORM PostgreSQL options](https://typeorm.io/docs/drivers/postgres/).

## VS Code

Open `vacation-manager.code-workspace`. The repository settings disable experimental tsgo for Vue tooling compatibility and recommend the Vue Official extension. After changing language-service settings, run **Developer: Reload Window**.

Dependency folders, build output, caches, and local environment files are ignored by Git.
