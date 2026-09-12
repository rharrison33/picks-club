import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function openDatabase(path = process.env.DB_PATH ?? fileURLToPath(new URL("../.data/picks-club.sqlite", import.meta.url))) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, state TEXT NOT NULL, password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS session_expiration ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL, default_fee_cents INTEGER NOT NULL CHECK(default_fee_cents BETWEEN 0 AND 100000),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS memberships (
      pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('organizer', 'player')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pool_id,user_id)
    ) STRICT;
    CREATE TRIGGER IF NOT EXISTS organizer_insert_limit BEFORE INSERT ON memberships
      WHEN NEW.role='organizer' AND (SELECT COUNT(*) FROM memberships WHERE pool_id=NEW.pool_id AND role='organizer') >= 2
      BEGIN SELECT RAISE(ABORT,'Two organizers maximum'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_update_limit BEFORE UPDATE OF role ON memberships
      WHEN NEW.role='organizer' AND OLD.role!='organizer' AND (SELECT COUNT(*) FROM memberships WHERE pool_id=NEW.pool_id AND role='organizer') >= 2
      BEGIN SELECT RAISE(ABORT,'Two organizers maximum'); END;
    CREATE TABLE IF NOT EXISTS pool_weeks (
      pool_id TEXT NOT NULL REFERENCES pools(id), saturday TEXT NOT NULL,
      fee_cents INTEGER NOT NULL CHECK(fee_cents BETWEEN 0 AND 100000),
      games_json TEXT NOT NULL DEFAULT '[]', published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pool_id,saturday)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS picks (
      pool_id TEXT NOT NULL, saturday TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
      game_id INTEGER NOT NULL, side TEXT NOT NULL CHECK(side IN ('home','away')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(pool_id,saturday,user_id,game_id),
      FOREIGN KEY(pool_id,saturday) REFERENCES pool_weeks(pool_id,saturday)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS pick_audit (
      id INTEGER PRIMARY KEY, pool_id TEXT NOT NULL, saturday TEXT NOT NULL, user_id TEXT NOT NULL,
      game_id INTEGER NOT NULL, side TEXT NOT NULL, saved_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS game_results (
      game_id INTEGER PRIMARY KEY, completed INTEGER NOT NULL,
      home_points INTEGER, away_points INTEGER, checked_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS verified_emails (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, verified_at INTEGER NOT NULL
    ) STRICT;
  `);
  // Upgrade earlier local databases without losing pools or published weeks.
  for (const table of ["pools", "pool_weeks"]) {
    const schema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {sql:string}).sql;
    if (schema.includes("100000")) {
      db.exec("PRAGMA foreign_keys=OFF");
      try { transaction(db, () => {
        db.exec(schema.replace(new RegExp("CREATE TABLE " + table, "i"), "CREATE TABLE " + table + "_upgrade").replaceAll("100000", "250000"));
        db.exec(`INSERT INTO ${table}_upgrade SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_upgrade RENAME TO ${table}`);
      }); } finally { db.exec("PRAGMA foreign_keys=ON"); }
    }
    if (!(db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).some((c) => c.name === "prizes_json")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN prizes_json TEXT NOT NULL DEFAULT '[100]'`);
    }
  }
  db.exec("CREATE TABLE IF NOT EXISTS age_acknowledgments (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, accepted_at INTEGER NOT NULL, version TEXT NOT NULL) STRICT");
  if (!(db.prepare("PRAGMA table_info(users)").all() as {name:string}[]).some((c) => c.name === "favorites_json")) db.exec("ALTER TABLE users ADD COLUMN favorites_json TEXT NOT NULL DEFAULT '[]'");
  for (const column of ["photo_url", "venmo_url"]) {
    if (!(db.prepare("PRAGMA table_info(users)").all() as {name:string}[]).some((c) => c.name === column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
  if (!(db.prepare("PRAGMA table_info(pools)").all() as {name:string}[]).some((c) => c.name === "venmo_url")) db.exec("ALTER TABLE pools ADD COLUMN venmo_url TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL, opted_in INTEGER NOT NULL, consent_at INTEGER NOT NULL,
      consent_version TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
      challenge TEXT, challenge_expires INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sms_outbox (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pool_id TEXT NOT NULL REFERENCES pools(id), saturday TEXT NOT NULL, game_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, provider_id TEXT,
      UNIQUE(user_id,pool_id,saturday,game_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sms_final_events (
      pool_id TEXT NOT NULL, saturday TEXT NOT NULL, game_id INTEGER NOT NULL, first_seen INTEGER NOT NULL,
      PRIMARY KEY(pool_id,saturday,game_id)
    ) STRICT;
  `);
  return db;
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = work(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
