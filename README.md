# Vacation Manager

A vacation request management assignment, built step by step.

## Current milestone: database schema and demo data

The backend uses Common Event Framework (CEF) 1.0.19, TypeORM 1.1.2, and PostgreSQL. The initial migration defines the assignment's users and vacation requests, and a repeatable seed creates demo data. The frontend remains the Vue scaffold. Authentication, business commands/events, listings, and application screens belong to later milestones.

```text
vacation-manager/
  frontend/                       Vue scaffold
  backend/
    src/entities/                 TypeORM mappings
    src/database/migrations/      Explicit schema changes
    src/database/                 Migration runner, seed, schema tests
    src/handlers/                 CEF health endpoint
  compose.yaml                    Optional PostgreSQL with persistent storage
  .prettierrc.json                 Shared formatting configuration
  vacation-manager.code-workspace
```

## Prerequisites

- Node.js 24.15 or newer in the 24.x line, or Node.js 26 or newer. The project is checked with Node.js 24.21.
- npm and Git.
- Docker with Compose, or an existing PostgreSQL 17+ server with the `btree_gist` extension available.

Backend runtime dependencies use caret ranges. Lockfiles and `npm ci` keep installations reproducible. If PowerShell blocks `npm.ps1`, use `npm.cmd` for the same commands.

## Install and configure

Install dependencies in each project:

```sh
cd frontend
npm ci
cd ../backend
npm ci
```

Copy `backend/.env.example` to `backend/.env` (PowerShell, from `backend/`: `Copy-Item .env.example .env`; other shells: `cp .env.example .env`). The example contains local demonstration database credentials. Adjust connection URLs when using another server or host port. AWS Parameter Store stays disabled.

## Database option 1: Docker Compose

From the repository root:

```sh
docker compose up -d --wait
```

PostgreSQL listens on `127.0.0.1:5432`. Compose uses a named `postgres_data` volume and a TCP healthcheck. `docker compose down` stops the service while preserving its data; `docker compose up -d --wait` starts it again.

If port 5432 is occupied, choose a different host port before starting Compose. In PowerShell:

```powershell
$env:POSTGRES_PORT = "5433"
docker compose up -d --wait
```

Also change the port in both connection URLs in `backend/.env`. The container still uses port 5432 internally.

Step 2's disposable `vacation-manager-db-check` container is no longer used. Stop it if it is still occupying the chosen port.

## Database option 2: Existing PostgreSQL

Docker is optional. Create an application database and, for integration tests, a separate empty test database. One local setup, run as a PostgreSQL administrator, is:

```sql
CREATE ROLE vacation LOGIN PASSWORD 'vacation_local';
CREATE DATABASE vacation_manager OWNER vacation;
CREATE DATABASE vacation_manager_test OWNER vacation;
```

Use an existing role instead if appropriate, and update `backend/.env` to match. The migration installs `btree_gist`, a trusted PostgreSQL extension; the database owner needs permission to create extensions, and the server must have the extension installed.

## Migrate and seed

From `backend/`:

```sh
npm run migration:run
```

This applies pending migrations in a transaction. Running it again does nothing when the schema is current. Application startup keeps `synchronize: false` and `migrationsRun: false`.

The copied `.env.example` already includes this public demo account password, so no additional environment changes are needed for seeding:

```dotenv
SEED_DEMO_PASSWORD=VacationDemo2026!
```

Then run:

```sh
npm run seed
```

A fresh database receives these accounts and 16 requests, enough to demonstrate pagination later:

| Name            | Email             | Role      |
| --------------- | ----------------- | --------- |
| Alice Requester | alice@example.com | Requester |
| Bob Requester   | bob@example.com   | Requester |
| Maya Validator  | maya@example.com  | Validator |

All three accounts use the demo password above. Passwords are stored as bcrypt hashes with cost 12. Login will be implemented in step 4.

The seed upserts users by email and updates their demo names, roles, and password hashes. For each requester it inserts eight requests only when that requester has no requests. Repeated runs preserve existing request dates, statuses, and comments, including when run on a later day. A transaction and advisory lock also serialize concurrent seed runs.

Initial dates are relative to the seed date in `Asia/Jerusalem`. Pending, Approved, and Rejected examples are included; rejected examples have comments, and active requests do not overlap for the same user. Rerunning the seed does not refresh dates in existing demo data.

To undo the latest migration, `npm run migration:revert` drops its tables and their data. Use it on a disposable database. The shared `btree_gist` extension remains installed.

## Run locally and check in a browser

Start the backend from `backend/`:

```sh
npm run dev
```

This generates CEF's handler registry, checks TypeScript, builds, and starts the server. Restart it after backend changes; `npm start` uses an existing build.

Open [http://localhost:8888/health](http://localhost:8888/health). The expected HTTP 200 response is:

```json
{
  "status": "ok",
  "database": "connected"
}
```

This endpoint checks connectivity with `SELECT 1`; migration and seed verification are separate. A database outage returns HTTP 503 with `{"status":"error","database":"unavailable"}`. Restoring PostgreSQL restores health without restarting the backend. Unmapped routes and CEF's automatic diagnostic routes return 404.

From `frontend/`, run `npm run dev` and open the URL printed by Vite. The page remains the scaffold's welcome screen; there are no vacation screens yet.

To inspect the seeded data with Docker, from the repository root:

```sh
docker compose exec db psql -U vacation -d vacation_manager -c "SELECT role, count(*) FROM users GROUP BY role;"
docker compose exec db psql -U vacation -d vacation_manager -c "SELECT status, count(*) FROM vacation_requests GROUP BY status;"
```

For an existing PostgreSQL instance, run the same SQL using its SQL client.

## Backend tests and checks

Create the separate test database once. With Docker, from the repository root:

```sh
docker compose exec db createdb -U vacation vacation_manager_test
```

Skip that command if the database was already created through the second setup option. Set `TEST_DATABASE_URL` in `backend/.env` to this empty test database, then from `backend/`:

```sh
npm test
npm run build
npm run lint
npm run format:check
```

The database tests require a database name ending in `_test` and refuse the application database or an existing application schema. They apply the migration, verify constraints and concurrent overlap rejection, check password hashes and seed repeatability across different dates, then revert the schema. Tests truncate their own users and requests between cases. TypeORM's migration history table and the shared extension remain for later test runs.

If a test run is interrupted before cleanup and the next run refuses the remaining tables, stop any test processes and recreate only the disposable test database. From the repository root:

```sh
docker compose exec db dropdb -U vacation vacation_manager_test
docker compose exec db createdb -U vacation vacation_manager_test
```

These commands delete the test database and its data; they leave `vacation_manager` unchanged. For an existing PostgreSQL server, recreate the separate test database using its administrator tools instead.

Both projects currently resolve Vitest 5.0.5.

Frontend checks, from `frontend/`:

```sh
npm run build
npm run test:unit -- --run
npm run lint
npm run format:check
```

The frontend lint command can apply fixes; backend lint only reports errors.

## Schema decisions and current limitations

- The tables contain exactly the assignment's columns. IDs are integer identities; `user_id` is a foreign key. Email is unique, and role/status values use check constraints.
- Vacation dates are PostgreSQL `DATE` columns mapped to `YYYY-MM-DD` strings. Creation/update timestamps use `timestamptz`.
- Database checks require `end_date > start_date` and a nonblank comment for Rejected requests.
- A partial GiST exclusion constraint combines the user ID with `daterange(start_date, end_date, '[]')` for Pending and Approved requests. End dates are inclusive, so vacations that share an endpoint conflict. Rejected requests do not block dates. PostgreSQL enforces this constraint across concurrent writes. See [PostgreSQL range constraints](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT) and [btree_gist](https://www.postgresql.org/docs/17/btree-gist.html).
- Listing indexes start with status or user ID, followed by descending creation time and ID. More query tuning can follow real listing queries.
- The schema prevents overlap now. Past-date validation, ownership, permissions, final-state transitions, commands, and business events remain for their planned milestones.
- CEF uses `root.yaml`, generated handler references, and its own build/local server. Routes can use synchronous or asynchronous `x-inputParser` functions. There is no Express server or AWS deployment.
- The source target remains ES2022 with ES2023 library types for CEF's bundled esbuild; Node 24 supplies TypeORM's runtime requirements. Explicit SQL column types avoid relying on inferred decorator metadata.
- Health checks share one pool of five connections with five-second connection/query timeouts.
- `npm audit` reports nine backend dependency entries (two high, seven moderate) in CEF's dependency tree, and four high-severity frontend entries in the lint dependency chain (`@vue/eslint-config-typescript` → `fast-glob` → `micromatch` → `braces`). That frontend chain is unchanged from the committed baseline. No forced downgrades or dependency overrides have been applied.

## Formatting and VS Code

The root `.prettierrc.json` configures semicolons, double quotes, and a 100-character print width. Both projects use the same pinned Prettier version.

From either project, `npm run format` formats the repository; `npm run format:check` checks without modifying files. Generated output, dependencies, lockfiles, and local environment files are excluded.

Open `vacation-manager.code-workspace`. Repository settings enable Prettier on save and disable experimental tsgo for Vue tooling. After changing language-service settings, run **Developer: Reload Window**.
