# Vacation Manager

A vacation request management assignment, built step by step.

## Current milestone: request listings and team planning

The backend uses Common Event Framework (CEF) 1.0.19, TypeORM 1.1.2, and PostgreSQL. The initial migration and repeatable seed provide the schema and demo data. Login issues an expiring JWT, and protected command endpoints create, approve, and reject vacation requests. Business events produce structured logs after successful commits. Requesters can list their own requests; Validators can filter and paginate all requests. Both roles can view approved team vacations without private request details. The frontend remains the Vue scaffold; application screens belong to the next milestone.

```text
vacation-manager/
  frontend/                       Vue scaffold
  backend/
    src/entities/                 TypeORM mappings
    src/auth/                     JWT signing, verification, user and role checks
    src/vacations/                Commands, queries, response views, date rules, and events
    src/database/migrations/      Explicit schema changes
    src/database/                 Migration runner, seed, schema tests
    src/handlers/                 Thin CEF HTTP handlers and input parsers
    src/testing/                  Shared test database setup and safety checks
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

All three accounts use the demo password above. Passwords are stored as bcrypt hashes with cost 12. Use these accounts with `POST /auth/login`.

The seed upserts users by email and updates their demo names, roles, and password hashes. For each requester it inserts eight requests only when that requester has no requests. Repeated runs preserve existing request dates, statuses, and comments, including when run on a later day. A transaction and advisory lock also serialize concurrent seed runs.

Initial dates are relative to the seed date in `Asia/Jerusalem`. Pending, Approved, and Rejected examples are included; rejected examples have comments, and active requests do not overlap for the same user. Rerunning the seed does not refresh dates in existing demo data.

To undo the latest migration, `npm run migration:revert` drops its tables and their data. Use it on a disposable database. The shared `btree_gist` extension remains installed.

## Configure JWT and run locally

Before starting the backend, replace `JWT_SECRET=replace-me` in the ignored `backend/.env` with a generated secret. From `backend/`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy that output into `JWT_SECRET`. The server refuses to start if the secret is missing, blank, or shorter than 32 UTF-8 bytes after trimming. The example deliberately contains an invalid placeholder. Migration and seed commands do not require this secret. Restart the backend after changing `.env`; changing the signing secret invalidates existing tokens.

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

## Authentication API and browser check

- `POST /auth/login` accepts a JSON object with `email` and `password`. Its CEF `x-inputParser` requires strings, trims/lowercases email, checks its format, and limits the password to 72 UTF-8 bytes for bcrypt. The password itself is preserved exactly.
- Successful login returns `{ "token": "<JWT>", "user": { "id": 1, "name": "Alice Requester", "email": "alice@example.com", "role": "Requester" } }`. Only the listed user fields are returned; no password hash is exposed. Login and profile responses use `Cache-Control: no-store`.
- Invalid input returns 400. Unknown email and incorrect password both return 401 with `{ "error": "Invalid email or password" }`. Unknown emails still run a cost-12 bcrypt comparison against a dummy hash.
- `GET /auth/me` requires `Authorization: Bearer <JWT>` and returns `{ "user": { ... } }` with the same safe fields. Missing/malformed tokens, invalid signatures, expired tokens, and deleted users receive the same generic 401 response. Role checks return 403 when an authenticated user lacks permission.

JWTs use explicit HS256 signing and an HS256-only verification allowlist. They contain `sub` (user ID), `role`, and the standard `iat`/`exp` claims, with a one-hour lifetime. The reusable `requireUser(event, roles?)` check reloads the user on every protected request and checks the database role, so role changes and deletions apply immediately. Identity never comes from a request body or query string. The role claim is informational, not the authorization source.

For a local browser check, open `/health`, open Developer Tools → Console, and run:

```js
const loginResponse = await fetch("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "alice@example.com", password: "VacationDemo2026!" }),
});
const session = await loginResponse.json();
console.log(loginResponse.status, session.user);
const meResponse = await fetch("/auth/me", {
  headers: { Authorization: `Bearer ${session.token}` },
});
console.log(meResponse.status, await meResponse.json());
console.log("Without a token:", (await fetch("/auth/me")).status);
```

Expect 200 for login/profile and 401 without a token. Repeat with `maya@example.com` to check the Validator profile. `/auth/me` supports both roles. Role-restricted handler behavior is tested through a test-only route, which is not exposed by the running application; vacation route permissions follow in later milestones.

There are no refresh tokens: expired tokens require a new login. The planned frontend will keep the token in `sessionStorage`, which JavaScript can read; an XSS bug could steal it. An httpOnly cookie would prevent JavaScript from reading the cookie and would require a cookie/CSRF design. Token storage and login screens will be implemented in the frontend milestone. This browser check keeps the token in the console session only.

## Vacation commands and business rules

All command endpoints require a bearer token. Inputs and responses use camelCase; vacation dates remain `YYYY-MM-DD` strings.

| Endpoint                               | Role      | Input                                                          | Success                       |
| -------------------------------------- | --------- | -------------------------------------------------------------- | ----------------------------- |
| `POST /vacation-requests`              | Requester | `startDate`, `endDate`, optional `reason` (max 500 characters) | 201, `{ "request": { ... } }` |
| `POST /vacation-requests/{id}/approve` | Validator | No body required                                               | 200, `{ "request": { ... } }` |
| `POST /vacation-requests/{id}/reject`  | Validator | Nonblank `comments` string (max 500 characters)                | 200, `{ "request": { ... } }` |

The request response contains `id`, `userId`, `startDate`, `endDate`, `reason`, `status`, `comments`, `createdAt`, and `updatedAt`. Reasons and rejection comments are trimmed; omitted or blank reasons become `null`. Both text fields are limited to 500 characters before trimming, measured using JavaScript string length (UTF-16 code units); exceeding the limit returns 400. An empty reason must be omitted or sent as `""`, not `null`. No user password, email, or nested user object is included.

- Creation always uses the authenticated Requester's ID and sets `Pending` with no decision comment. Extra identity, role, or status fields cannot override these values. Validators cannot submit requests.
- Dates must be real calendar dates. A new request may start today in `Asia/Jerusalem`, but cannot start earlier. End date must be strictly after start date.
- End dates are inclusive. A request ending on the 22nd conflicts with one starting on the 22nd for the same user. Pending and Approved requests block overlaps; Rejected requests do not.
- Any Validator can approve or reject a Pending request, including one whose start date has passed. Rejection requires a nonblank comment after trimming. Approved and Rejected are final states. No edit, delete, cancellation, or decision reversal endpoints are provided.
- Invalid input returns 400, missing/invalid authentication 401, wrong roles 403, missing requests 404, and overlapping dates or an already-final request 409. Database details are never returned.

CEF input parsers check HTTP input shapes. Thin handlers authenticate the user and call explicit `CreateVacationRequestCommand`, `ApproveVacationRequestCommand`, or `RejectVacationRequestCommand` classes. Commands enforce business rules and use TypeORM transactions. In `root.yaml`, CEF 1.0.19 requires its scaffold's `:id` route syntax rather than OpenAPI's `{id}` syntax; actual URLs use the numeric request ID.

Creation checks for existing overlaps to return a friendly error. The PostgreSQL exclusion constraint closes the race between that check and insertion; its `23P01` error becomes 409. Check-constraint errors (`23514`) become a generic 400. Decisions acquire a `pessimistic_write` row lock (`SELECT ... FOR UPDATE`) before checking status, so a competing decision waits and then rejects the already-final state. All transactional queries use the transaction's repository, and decisions use `save` so TypeORM updates `updated_at`.

After the transaction resolves successfully, the command publishes `VacationRequestCreatedEvent`, `VacationRequestApprovedEvent`, or `VacationRequestRejectedEvent`. The small in-process publisher calls a structured log handler with only event type, request/user/actor IDs, and timestamp. It excludes names, emails, passwords, tokens, reasons, and comments. Listener or logging failures are caught and cannot turn a committed operation into an HTTP failure. Events are not durable across crashes and are not a persistent audit trail; delivery order across concurrent requests is not guaranteed. There is no queue or Event Sourcing.

For a browser check before the frontend milestone, use the authentication console example above to obtain an Alice token and a Maya token. Submit a request with free future dates using Alice's token, then approve it using Maya's. Submit another non-overlapping request and reject it with a comment. Confirm a Requester gets 403 when attempting a decision, missing comments return 400, repeating a final decision returns 409, and overlapping an Approved request returns 409. Application screens and frontend session handling are still planned for the next milestone.

## Request listings and team planning

All read endpoints require a bearer token and return `Cache-Control: no-store`. Responses use camelCase, and vacation dates remain `YYYY-MM-DD` strings.

| Endpoint                      | Role      | Query                                                        | Response                                                                                                |
| ----------------------------- | --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `GET /vacation-requests/mine` | Requester | Optional `page`; any `userId` is ignored                     | `{ "items": [requestWithUser, ...], "page": 1, "pageSize": 10, "total": 8 }`                            |
| `GET /vacation-requests`      | Validator | Optional `status`, `userId`, `page`                          | `{ "items": [requestWithUser, ...], "page": 1, "pageSize": 10, "total": 16 }`                           |
| `GET /users?role=Requester`   | Validator | Only `Requester` is supported; omitted `role` defaults to it | `{ "items": [{ "id": 1, "name": "Alice Requester" }, ...] }`                                            |
| `GET /team-vacations`         | Both      | Required `from` and `to`; maximum 366 days apart             | `{ "items": [{ "name": "Alice Requester", "startDate": "2050-01-05", "endDate": "2050-01-07" }, ...] }` |

The own-request listing takes identity only from the authenticated user. Any `userId` query is ignored, so one Requester cannot inspect another Requester's requests. It reuses the Validator listing query with the user ID fixed to the token's user, returning ten-row pages with status, reason, rejection comments, and the user's safe ID/name. Its `total` counts only that user's requests. `page` defaults to 1 and uses the same validation and `createdAt DESC, id DESC` ordering as the Validator listing. A page past the end returns an empty list with the same own total. Validators receive 403 on this endpoint.

The Validator listing supports status and user filters independently or together. Status must be exactly `Pending`, `Approved`, or `Rejected`. `userId` and `page` must be positive decimal integers up to 2147483647; blank, zero, negative, fractional, and malformed values return 400. Missing `page` defaults to 1. Omit unused filters instead of sending empty strings. A valid user ID with no requests produces an empty result.

Both request listings share one SQL pagination implementation through TypeORM `skip`/`take`, with a fixed page size of 10 and `createdAt DESC, id DESC` sorting. `total` counts all rows matching the filters, independent of the requested page. A page beyond the results returns `items: []` with that same filtered total. Each row contains the normal request fields plus `user: { id, name }`. A join fetches names without one user query per request; employee emails and password hashes are not selected. The dropdown endpoint also selects and returns only Requester IDs and names, ordered by name then ID.

Team planning interprets the assignment's team as all users belonging to one team. Both roles see **Approved vacations only**, with exactly `name`, `startDate`, and `endDate`. Reasons, rejection comments, emails, and IDs are excluded through explicit SQL selection and a fixed response projection. The query uses hydrated TypeORM entities rather than raw date values, preserving date strings.

Team dates must pass the same calendar-date check as request submission, but allow past ranges and `to >= from`, including a single day. `to` may be at most 366 calendar days after `from`: exactly 366 days is accepted and 367 returns 400. The difference is calculated at UTC midnight so daylight-saving changes cannot affect it; because the endpoints are inclusive, a maximum-length range covers 367 date labels. This cap bounds the date window while keeping the team view unpaginated. The inclusive overlap condition is `startDate <= to AND endDate >= from`; it includes vacations starting or ending on a boundary and those spanning the entire filter range. Results are ordered by start date then request ID. There is no team calendar UI.

For a read-only browser check, open `/health` and run the authentication example to obtain Alice's `session`. Then run:

```js
const validatorLoginResponse = await fetch("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "maya@example.com", password: "VacationDemo2026!" }),
});
const validatorSession = await validatorLoginResponse.json();
const readWithToken = async (path, token) => {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
};
console.log(await readWithToken("/vacation-requests/mine?page=1", session.token));
console.log(await readWithToken("/vacation-requests/mine?page=2", session.token));
console.log(await readWithToken("/users?role=Requester", validatorSession.token));
console.log(await readWithToken("/vacation-requests?page=1", validatorSession.token));
console.log(await readWithToken("/vacation-requests?page=2", validatorSession.token));
console.log(
  await readWithToken("/vacation-requests?status=Approved&userId=1", validatorSession.token),
);
const planningFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
  new Date(),
);
const planningEnd = new Date(`${planningFrom}T00:00:00Z`);
planningEnd.setUTCDate(planningEnd.getUTCDate() + 60);
const planningTo = planningEnd.toISOString().slice(0, 10);
console.log(
  await readWithToken(`/team-vacations?from=${planningFrom}&to=${planningTo}`, session.token),
);
```

With a fresh seed, the all-request pages contain 10 and 6 rows, with total 16. Each Requester has 8 requests: own page 1 has 8 rows, page 2 is empty, and both report total 8. The next-60-day team range contains the 6 freshly seeded Approved vacations. These counts change when you submit or decide requests or when seeded dates fall outside the selected range. Requesters receive 403 on the Validator listing/dropdown, and missing tokens receive 401 on every read endpoint. Any valid team range of up to 366 elapsed days can be used.

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

The database tests require a database name ending in `_test` and refuse the application database or an existing application schema. Vitest `globalSetup` applies the initial migration before test files run and reverts it after all files finish. Files run sequentially and truncate only the test users/requests between cases. The schema suite also explicitly checks a migration rollback/reapplication. TypeORM's migration history table and the shared extension remain for later test runs.

Tests cover schema constraints and concurrent overlap rejection, hashes, seed repeatability, input validation through CEF routing, both roles, generic login failures, token verification failures, safe response fields, role changes, deleted users, and invalid JWT configuration. Command tests cover real calendar dates and Jerusalem's day boundary, creation ownership, final decisions, rejection comments, and real PostgreSQL races. They force an insertion to wait on an uncommitted overlap and two decisions to wait on a locked row, then verify the resulting 409 responses and event counts. A separate database connection verifies that event listeners see committed data. Logging failures cannot fail an otherwise successful HTTP response. Listing tests cover ownership isolation, every filter combination and filtered totals, SQL pagination with identical timestamps, bounded query counts, dropdown privacy, Approved-only team fields, inclusive and single-day overlaps, past ranges, and string dates. The test command generates CEF's handler registry first, so it also works on a fresh checkout.

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
- Listing indexes start with status or user ID, followed by descending creation time and ID. Both request listings use ten-row SQL pages. Team planning remains unpaginated with a maximum range of 366 elapsed days; the range cap does not limit how many employees or vacations can appear within that window. More query tuning can follow real listing queries.
- The backend provides login, token verification, role checks, creation ownership, date rules, final-state transitions, commands, business events, requester-owned listings, validator filters/pagination, the requester dropdown, and the approved team view. Frontend session handling and application screens remain for the next milestone.
- CEF uses `root.yaml`, generated handler references, and its own build/local server. Routes can use synchronous or asynchronous `x-inputParser` functions. There is no Express server or AWS deployment.
- The source target remains ES2022 with ES2023 library types for CEF's bundled esbuild; Node 24 supplies TypeORM's runtime requirements. Explicit SQL column types avoid relying on inferred decorator metadata.
- Health checks share one pool of five connections with five-second connection/query timeouts.
- `npm audit` reports nine backend dependency entries (two high, seven moderate) in CEF's dependency tree, and four high-severity frontend entries in the lint dependency chain (`@vue/eslint-config-typescript` → `fast-glob` → `micromatch` → `braces`). That frontend chain is unchanged from the committed baseline. No forced downgrades or dependency overrides have been applied.

## Formatting and VS Code

The root `.prettierrc.json` configures semicolons, double quotes, and a 100-character print width. Both projects use the same pinned Prettier version.

From either project, `npm run format` formats the repository; `npm run format:check` checks without modifying files. Generated output, dependencies, lockfiles, and local environment files are excluded.

Open `vacation-manager.code-workspace`. Repository settings enable Prettier on save and disable experimental tsgo for Vue tooling. After changing language-service settings, run **Developer: Reload Window**.
