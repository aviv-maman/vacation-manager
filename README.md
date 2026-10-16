# Vacation Manager

Vacation Manager manages employee time-off requests and manager decisions. Both roles can view approved team vacations without exposing private request details. Built with Vue 3, TypeScript, Vue Router, Axios, Tailwind CSS, Node.js, Common Event Framework, TypeORM, and PostgreSQL.

## Quick start

Requires Git, npm, Node.js **24.15+ within 24.x or 26+**, and Docker Compose.

```sh
git clone https://github.com/aviv-maman/vacation-manager.git
cd vacation-manager
npm --prefix frontend ci
npm --prefix backend ci
cp backend/.env.example backend/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `JWT_SECRET` in `backend/.env` to the generated value. Keep this file local; example values match Compose. Missing or weak secrets prevent backend startup.

```sh
docker compose up -d --wait
npm --prefix backend run migration:run
npm --prefix backend run seed
npm --prefix backend run dev
```

In a second terminal, from the repository root:

```sh
npm --prefix frontend run dev
```

Open **http://localhost:5173** (or the URL Vite prints). The API runs on port **8888**. Requesters land on **My requests**; Validators land on **Review requests**. Use **Team planning** from either account.

| Name            | Email             | Role      |
| --------------- | ----------------- | --------- |
| Alice Requester | alice@example.com | Requester |
| Bob Requester   | bob@example.com   | Requester |
| Maya Validator  | maya@example.com  | Validator |

All accounts use **`VacationDemo2026!`**. A fresh seed creates three users and sixteen requests covering all statuses. Passwords are stored as bcrypt hashes. Migrations and seeding can be rerun without duplicate demo data.

Compose uses a persistent named volume; `docker compose down` preserves data. For a different database port, set `POSTGRES_PORT` and update both URLs in `backend/.env`. Restart the backend after code/environment changes. PowerShell supports `cp`; use `npm.cmd` if execution policy blocks `npm.ps1`.

## Without Docker

Use PostgreSQL **17+** with `btree_gist` available. As a PostgreSQL administrator:

```sql
CREATE ROLE vacation LOGIN PASSWORD 'vacation_local';
CREATE DATABASE vacation_manager OWNER vacation;
CREATE DATABASE vacation_manager_test OWNER vacation;
```

Follow Quick start, skipping `docker compose up`. Update `DATABASE_URL` and `TEST_DATABASE_URL` in `backend/.env` for your server. The database owner needs permission to create the extension; then run the same migration, seed, and application commands.

## Tests and checks

Backend tests use a separate, empty database whose name ends in `_test` (set by `TEST_DATABASE_URL`). From the repository root, create it once with Compose (skip if already created), then run the checks:

```sh
docker compose exec db createdb -U vacation vacation_manager_test
npm --prefix backend test
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend run format:check
npm --prefix frontend run test:unit -- --run
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run format:check
```

## Architecture

```text
vacation-manager/
  frontend/src/
    views/, router/         Route composition and role guards
    components/             Auth, navigation, requests, team, shared controls
    composables/, lib/      Session, pagination, URL state, Axios, date helpers
    types/                  Shared frontend API types
  backend/src/
    root.yaml               API routes and input-parser configuration
    handlers/, auth/        HTTP input, authentication, authorization
    vacations/              Commands, queries, business rules, events
    entities/, database/    TypeORM mappings, migration, repeatable seed
    testing/                Dedicated test database setup
  compose.yaml              PostgreSQL and persistent volume
```

A write follows **CEF route → input parser → handler → command → transaction → event**. Parsers validate input; handlers authenticate and delegate; commands own business rules and transactional writes. Read queries handle ownership, filtering, and SQL pagination separately. Vue route views compose feature components; both request screens reuse the list, status badge, pagination controls, and data-loading composable. Loading, empty, error, and submitting states are explicit.

## Commands and events

| Command                         | Rule highlights                                            | Event                          |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `CreateVacationRequestCommand`  | Requester ownership, valid future dates, no active overlap | `VacationRequestCreatedEvent`  |
| `ApproveVacationRequestCommand` | Validator role, Pending state, locked decision             | `VacationRequestApprovedEvent` |
| `RejectVacationRequestCommand`  | Validator role, Pending state, nonblank comment            | `VacationRequestRejectedEvent` |

Events publish **after commit** and only produce structured logs of event type, IDs, and time. They exclude credentials, tokens, reasons, and comments; listener failures cannot fail an already-committed request.

## API

All routes except login and health require a bearer token. Request/response details are defined in [`backend/src/root.yaml`](backend/src/root.yaml).

| Method | Path                             | Role      | Purpose                                     |
| ------ | -------------------------------- | --------- | ------------------------------------------- |
| POST   | `/auth/login`                    | Public    | Log in and receive a token                  |
| GET    | `/auth/me`                       | Both      | Read the current user profile               |
| POST   | `/vacation-requests`             | Requester | Submit a request                            |
| GET    | `/vacation-requests/mine`        | Requester | Paginate the authenticated user's requests  |
| GET    | `/vacation-requests`             | Validator | Filter by status/user and paginate          |
| POST   | `/vacation-requests/:id/approve` | Validator | Approve a Pending request                   |
| POST   | `/vacation-requests/:id/reject`  | Validator | Reject with a comment                       |
| GET    | `/users?role=Requester`          | Validator | Populate the employee filter                |
| GET    | `/team-vacations?from=…&to=…`    | Both      | List approved vacations overlapping a range |
| GET    | `/health`                        | Public    | Check database connectivity                 |

## Business rules and assumptions

- Requesters submit only for themselves; identity comes from the token. Only Validators can decide requests, and the backend enforces every permission.
- Dates must be real calendar dates, with end strictly after start. A request may start today in **Asia/Jerusalem**, but never earlier.
- End dates are **inclusive**: sharing an endpoint counts as overlap. Pending and Approved requests block the same user's dates; Rejected requests do not.
- New requests are Pending. Approved and Rejected are final; a Validator may still decide a Pending request whose start date has passed.
- Rejection requires a nonblank comment. Optional reasons and rejection comments are trimmed and limited to 500 characters each.
- Everyone belongs to one team. Both roles see names and dates for approved vacations; reasons, comments, emails, and IDs are excluded.
- Team ranges allow past dates and single days, with at most 366 elapsed days between endpoints; both request listings use ten-row pages.

## Technical decisions

- **Race-proof overlaps:** a partial PostgreSQL exclusion constraint using `btree_gist` enforces the overlap rule atomically, alongside friendly command validation.
- **Concurrent decisions:** transactional row locks serialize approval/rejection, so a second decision cannot overwrite a final state.
- **Date-only values:** PostgreSQL `DATE` maps to `YYYY-MM-DD` strings, avoiding JavaScript time-zone shifts; timestamps retain time-zone information.
- **Authentication:** one-hour HS256 JWTs identify the user; protected requests reload the database user and role, making deletion and permission changes effective immediately.
- **Predictable queries:** both listings share SQL pagination ordered by creation time then ID; joins fetch employee names without a query per row.
- **Local browser calls:** the Vite proxy forwards relative API paths to the backend, keeping development on one browser origin.
- **URL state:** dashboard filters/pages and applied team dates survive reload and Back/Forward; user actions use history push, automatic page correction uses replace.
- **Explicit schema:** reviewed migrations create constraints and indexes; automatic schema synchronization stays disabled.

## Known limitations

- Seeded accounts only; no registration, password recovery, request editing, cancellation, deletion, or decision reversal.
- Tokens use JavaScript-readable `sessionStorage`, so XSS could steal them; no httpOnly-cookie design or refresh tokens are implemented.
- Team planning is an unpaginated table; its date-range cap does not limit the number of matching rows.
- Events are in-process notifications, without durable delivery or a persistent audit trail; a crash after commit can lose an event.
- Local execution only; hosting the production frontend needs same-origin API routing and history fallback beyond the development proxy.
- Transitive dependency advisories remain in CEF tooling and the frontend lint chain; no forced dependency overrides are applied.
