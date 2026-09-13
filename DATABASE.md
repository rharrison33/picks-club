# Postgres and hosting

The API uses Postgres through `pg`. Accounts, sessions, profile photos, Venmo links, pools, published lineups, picks, results, and SMS preferences live in the database. React never receives the database connection URL.

## Local development

Set `DATABASE_URL` in the root `.env` to the connection URL for a database you own. Keep it out of Git and chat. Then:

```powershell
npm ci --prefix server
npm run dev --prefix server
```

The initial schema is applied transactionally on startup and recorded in `schema_migrations`. The health endpoint checks the database connection. Missing database configuration fails startup; it never falls back to SQLite.

On the original Windows development machine, a private cluster was created in `.data/postgres`, bound to `127.0.0.1:55432`, with a random password saved in `.env`. Start it after a reboot with:

```powershell
npm run db:start --prefix server
```

This helper only starts an existing local cluster; it does not overwrite or reinitialize data. It uses the matching installed Postgres binaries. `PG_BIN` can point to a Postgres `bin` directory. This machine's existing Postgres 12 installation was used for local compatibility testing only. Production and CI target Postgres 17; use a maintained Postgres version for new installations.

On another computer, install Postgres 17 or create a managed database, create a dedicated database/user, and set `DATABASE_URL`. The local SQLite file is no longer used by the app.

## Transfer existing SQLite data

Stop the old SQLite-backed application before importing. Keep a consistent backup of its database, including any uncheckpointed WAL. Point `DATABASE_URL` at a **new, empty Postgres database**, then:

```powershell
npm run db:import --prefix server -- "C:/path/to/picks-club.sqlite"
```

The importer opens SQLite read-only, copies all application tables in dependency order, verifies row counts, and resets generated ID sequences. It refuses a nonempty destination and rolls back on failure. It does not delete or alter the source. Password hashes and session tokens are copied unchanged. It expects the final SQLite schema from this repository's pre-Postgres version.

The initial local transfer has been completed. Do not re-run it against the populated local Postgres database. Archived SQLite data and backups stay under ignored `.data/`.

## Backups

Use Postgres client tools matching or newer than the server's major version. With `DATABASE_URL` configured:

```powershell
npm run backup --prefix server
```

This creates a custom-format `pg_dump` archive under `.data/postgres-backups` and checks its archive directory. Credentials are passed through the child process environment, not command arguments. A restore rehearsal into a separate temporary database was performed locally. Keep encrypted off-host copies and verify the managed provider's retention/recovery settings before launch; the script alone does not schedule backups.

For a restore rehearsal, create an empty test database, set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` privately, then run `pg_restore --no-password --exit-on-error --no-owner --no-acl --dbname <test-database> <archive.dump>`. Compare accounts, memberships, lineups, and picks before considering recovery complete. Never restore over a running production database.

## Tests and concurrency

`npm test --prefix server` runs against PGlite, an embedded Postgres engine. Set `TEST_DATABASE_URL` to run the same suite on a Postgres server instead. Each test gets a randomly named schema, which is dropped afterward; never give the test runner production credentials. GitHub Actions runs the suite against Postgres 17.

Transactions use one checked-out connection, with context-local queries and rollback. A transaction-scoped advisory lock serializes the app's multi-step writes for pilot-scale correctness. A database trigger enforces the two-organizer maximum. This global write lock should be narrowed to per-pool locks if write contention becomes material. Authentication rate limiting remains process-local; add shared limits before scaling the app horizontally.

## Public deployment

`render.yaml` provisions one web service and one managed Postgres 17 database in the same region, connecting them with `DATABASE_URL` on Render's private network. External database access is blocked by default. No application disk is required for persistent data; profile photos are stored in Postgres.

1. Sign in to Render with GitHub and connect the Picks Club repository.
2. Create a Blueprint from `render.yaml`. Review the displayed web-service and database costs before provisioning.
3. Set `APP_ORIGIN`, `CFBD_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, and the pilot organizer email. The database URL is supplied automatically. Keep secrets in Render's environment settings.
4. Verify email delivery, cookies, health, saved picks, backups, and all outstanding launch gates in `LAUNCH.md`. The production paid-contest publication gate remains in place.
5. The owner purchased `picks-club.com` through Namecheap. Add it under the Render service's custom domains and use the DNS records Render supplies in Namecheap. Once verified, set `APP_ORIGIN=https://picks-club.com` and configure email-domain verification.

Hosting, billing, DNS, and email delivery have not yet been activated. See [Render Blueprints](https://render.com/docs/blueprint-spec), [Postgres connections](https://render.com/docs/postgresql-creating-connecting), and [custom domains](https://render.com/docs/custom-domains).
