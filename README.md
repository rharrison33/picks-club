# Picks Club

A sports pick’em app for competing with friends. Built step by step to practice React, TypeScript, and Node.js.

## Status

Accounts, private pools, organizer/player views, weekly entry amounts, and eight-game lineups are implemented. Layouts adapt to mobile and desktop. Saved picks, kickoff locks, and weekly standings are implemented. Payments are not enabled. See LAUNCH.md for the pilot plan and outstanding launch gates.

## Current features

- Register with email, password, display name, and 1–5 favorite teams; sign in and sign out.
- Create multiple private pools or join using an invitation code.
- One or two organizers per pool, enforced on the server.
- Set a default weekly amount per player and override it for individual Saturdays.
- Save draft lineups, choose eight future games, and publish. Publication locks games and entry amounts.
- Players see published weeks; organizers have editing controls and a player preview.
- Schedules, logos, AP ranks, records, and available odds from CollegeFootballData.
- Suggestions prioritize ranked close matchups and each pool's favorite teams.

Email verification and password recovery use Resend once configured. Registration requires a recorded 21+ acknowledgment. Payment integrations are future work. Existing browser-only pools are not migrated into accounts.

## Stack

- Frontend: React and TypeScript
- Backend: Node.js, Express, and TypeScript
- Database: Postgres (`pg`), with PGlite for isolated tests
- Sports data: [CollegeFootballData](https://collegefootballdata.com/)

## Local setup

Clone the repository and open it in VS Code:

```powershell
git clone https://github.com/rharrison33/picks-club.git
cd picks-club
code .
```

Copy the environment template once, without overwriting an existing local file:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Get a [free CollegeFootballData API key](https://collegefootballdata.com/key) and enter it in your local `.env`:

```dotenv
CFBD_API_KEY=your_key_here
```

Requires Node.js 24 or newer. Start the backend in one terminal:

```powershell
cd server
npm ci
npm run dev
```

Start the frontend in a second terminal from the repository root:

```powershell
cd client
npm ci
npm run dev
```

Open http://localhost:5173 and choose **Register**. Create a pool, share its invitation code, and promote a second member to organizer if desired. There is no default account or password.

The backend loads the root `.env` automatically. Accounts and pools work without a sports API key; game feeds require it. The frontend proxies `/api` to port 3001. Run npm commands in the client or server folder, not the repository root.

## Keeping the key private

- `.env` and `.env.*` are ignored by Git; only the blank `.env.example` is committed.
- Keep the key on the backend. Never include it in React code or a `VITE_` variable.
- React calls our backend; our backend calls CollegeFootballData.
- Use hosting environment settings for deployed secrets.
- Never log the key. If it is exposed or committed, revoke and replace it.

Verify the ignore rule after creating `.env`:

```powershell
git check-ignore .env
git status --short
```

The first command should print `.env`; the second should not list it as an untracked file.

## Weekly flow

Choose a Saturday in the pool's timezone, review suggestions and the entry amount, save a draft, then publish exactly eight future games. Publishing locks the amount and lineup. Players save picks individually before each published kickoff. Final results score one point per outright winner; ties score zero. No payment is collected.

Amounts are stored in whole cents, from $10 to $2,500 per player. A pool's default applies to unsaved weeks; saved drafts and published weeks keep their own amount. Replacing an invitation code disables the old code without removing members.

## Game selection

Games with an AP-ranked team and an absolute spread of seven points or less receive the highest priority. Within that tier, recommendations consider favorite teams, competitiveness, AP rank, and whether both teams are ranked. Each member contributes at most one favorite-team vote per matchup, whether they chose one team or five. Stable tiebreakers keep repeated selections consistent. Suggestions exclude games that have started.

Missing odds are shown as unavailable, never interpreted as a zero-point spread. One available provider is selected deterministically. Odds are cached, not live or guaranteed prices. Rankings use the latest available AP poll up to the selected week. Optional missing metadata does not block schedules.

## Storage and authentication

Accounts, profiles, memberships, sessions, picks, results, and weekly snapshots persist in Postgres. Set `DATABASE_URL` privately in `.env`. See [DATABASE.md](DATABASE.md) for local setup, SQLite import, backups, and managed hosting.

Passwords are salted and hashed using scrypt. Random session tokens are stored hashed in the database and sent in HttpOnly, SameSite=Strict cookies. Sessions expire after seven days. Production cookies require HTTPS. Mutations require a custom request header and an allowed origin. Authentication attempts are rate limited within the server process.

This is a local development implementation. Email verification and password recovery are implemented but require real delivery testing. Before public launch, complete hosting configuration, off-host backups, monitoring, and the gates in LAUNCH.md. Postgres provides shared storage; multiple application instances still require distributed rate limiting. Member lists expose display name to pool members, not email.

Optional server environment settings:

- `PORT`: backend port, default 3001; also update the frontend proxy if changed.
- `APP_ORIGIN`: exact allowed browser origin for hosting or an alternate development URL.
- `DATABASE_URL`: required Postgres connection URL; keep credentials private.
- `NODE_ENV=production`: secure cookies; requires HTTPS.

The backend listens on loopback locally. Hosting and real payment integrations are separate work. Venmo, Cash App, Apple Pay, and PayPal are future options, not connected providers.

## Checks

```powershell
cd server
npm run typecheck
npm test
cd ../client
npm run lint
npm run build
```

Tests cover authentication, session invalidation, pool isolation, organizer limits, permissions, invitation rotation, fee validation, publication locking, favorite-team ranking, and missing-odds handling.
