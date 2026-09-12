CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, state TEXT NOT NULL, password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , favorites_json TEXT NOT NULL DEFAULT '[]', photo_url TEXT NOT NULL DEFAULT '', venmo_url TEXT NOT NULL DEFAULT '') STRICT;

CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;

CREATE INDEX session_expiration ON sessions(expires_at);

CREATE TABLE memberships (
      pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('organizer', 'player')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pool_id,user_id)
    ) STRICT;

CREATE TABLE picks (
      pool_id TEXT NOT NULL, saturday TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
      game_id INTEGER NOT NULL, side TEXT NOT NULL CHECK(side IN ('home','away')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(pool_id,saturday,user_id,game_id),
      FOREIGN KEY(pool_id,saturday) REFERENCES pool_weeks(pool_id,saturday)
    ) STRICT;

CREATE TABLE pick_audit (
      id INTEGER PRIMARY KEY, pool_id TEXT NOT NULL, saturday TEXT NOT NULL, user_id TEXT NOT NULL,
      game_id INTEGER NOT NULL, side TEXT NOT NULL, saved_at INTEGER NOT NULL
    ) STRICT;

CREATE TABLE game_results (
      game_id INTEGER PRIMARY KEY, completed INTEGER NOT NULL,
      home_points INTEGER, away_points INTEGER, checked_at INTEGER NOT NULL
    ) STRICT;

CREATE TABLE email_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at INTEGER NOT NULL
    ) STRICT;

CREATE TABLE verified_emails (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, verified_at INTEGER NOT NULL
    ) STRICT;

CREATE TABLE "pools" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL, default_fee_cents INTEGER NOT NULL CHECK(default_fee_cents BETWEEN 0 AND 250000),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , prizes_json TEXT NOT NULL DEFAULT '[100]', venmo_url TEXT NOT NULL DEFAULT '') STRICT;

CREATE TABLE "pool_weeks" (
      pool_id TEXT NOT NULL REFERENCES pools(id), saturday TEXT NOT NULL,
      fee_cents INTEGER NOT NULL CHECK(fee_cents BETWEEN 0 AND 250000),
      games_json TEXT NOT NULL DEFAULT '[]', published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, prizes_json TEXT NOT NULL DEFAULT '[100]',
      PRIMARY KEY(pool_id,saturday)
    ) STRICT;

CREATE TABLE age_acknowledgments (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, accepted_at INTEGER NOT NULL, version TEXT NOT NULL) STRICT;

CREATE TABLE sms_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL, opted_in INTEGER NOT NULL, consent_at INTEGER NOT NULL,
      consent_version TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
      challenge TEXT, challenge_expires INTEGER
    ) STRICT;

CREATE TABLE sms_outbox (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pool_id TEXT NOT NULL REFERENCES pools(id), saturday TEXT NOT NULL, game_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, provider_id TEXT,
      UNIQUE(user_id,pool_id,saturday,game_id)
    ) STRICT;

CREATE TABLE sms_final_events (
      pool_id TEXT NOT NULL, saturday TEXT NOT NULL, game_id INTEGER NOT NULL, first_seen INTEGER NOT NULL,
      PRIMARY KEY(pool_id,saturday,game_id)
    ) STRICT;