# Picks Club

A sports pick’em app for competing with friends. Built step by step to practice React, TypeScript, and Node.js.

## Status

Planning and initial setup. Application code, dependencies, and run scripts have not been added yet.

## First version

- One Saturday college football contest with eight games.
- Import schedules and results automatically from CollegeFootballData.
- Automatically suggest eight games, with organizer overrides before picks open.
- Pick outright winners; lock each pick at kickoff on the server.
- Award one point for each correct pick and display a leaderboard.

Game-selection rules, the contest timezone, tie handling, and postponed-game rules will be finalized during implementation. Free-tier coverage, quotas, and result delays must be checked before choosing a refresh schedule.

## Planned stack

- Frontend: React and TypeScript
- Backend: Node.js, Express, and TypeScript
- Database: Postgres
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

The environment file does not load itself. When the backend is added, its startup configuration must load this root `.env` file. The backend will read `process.env.CFBD_API_KEY`.

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

## Build milestones

1. Scaffold the frontend and backend.
2. Fetch upcoming Saturday games through the backend and display them in React.
3. Store games and generate an eight-game contest with optional organizer edits.
4. Add accounts, picks, and server-enforced deadlines.
5. Import final results and calculate standings.

Entry fees and payouts are not implemented.
