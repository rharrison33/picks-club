CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, state TEXT NOT NULL, password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , favorites_json TEXT NOT NULL DEFAULT '[]', photo_url TEXT NOT NULL DEFAULT '', venmo_url TEXT NOT NULL DEFAULT '');

CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );

CREATE TABLE "pools" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE,
      timezone TEXT NOT NULL, default_fee_cents BIGINT NOT NULL CHECK(default_fee_cents BETWEEN 0 AND 250000),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , prizes_json TEXT NOT NULL DEFAULT '[100]', venmo_url TEXT NOT NULL DEFAULT '');

CREATE TABLE memberships (
      pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('organizer', 'player')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pool_id,user_id)
    );

CREATE TABLE "pool_weeks" (
      pool_id TEXT NOT NULL REFERENCES pools(id), saturday TEXT NOT NULL,
      fee_cents BIGINT NOT NULL CHECK(fee_cents BETWEEN 0 AND 250000),
      games_json TEXT NOT NULL DEFAULT '[]', published BIGINT NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, prizes_json TEXT NOT NULL DEFAULT '[100]',
      PRIMARY KEY(pool_id,saturday)
    );

CREATE TABLE picks (
      pool_id TEXT NOT NULL, saturday TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
      game_id BIGINT NOT NULL, side TEXT NOT NULL CHECK(side IN ('home','away')),
      updated_at BIGINT NOT NULL,
      PRIMARY KEY(pool_id,saturday,user_id,game_id),
      FOREIGN KEY(pool_id,saturday) REFERENCES pool_weeks(pool_id,saturday)
    );

CREATE TABLE pick_audit (
      id BIGSERIAL PRIMARY KEY, pool_id TEXT NOT NULL, saturday TEXT NOT NULL, user_id TEXT NOT NULL,
      game_id BIGINT NOT NULL, side TEXT NOT NULL, saved_at BIGINT NOT NULL
    );

CREATE TABLE game_results (
      game_id BIGINT PRIMARY KEY, completed BIGINT NOT NULL,
      home_points BIGINT, away_points BIGINT, checked_at BIGINT NOT NULL
    );

CREATE TABLE email_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at BIGINT NOT NULL
    );

CREATE TABLE verified_emails (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, verified_at BIGINT NOT NULL
    );

CREATE TABLE age_acknowledgments (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, accepted_at BIGINT NOT NULL, version TEXT NOT NULL);

CREATE TABLE sms_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL, opted_in BIGINT NOT NULL, consent_at BIGINT NOT NULL,
      consent_version TEXT NOT NULL, verified BIGINT NOT NULL DEFAULT 0,
      challenge TEXT, challenge_expires BIGINT
    );

CREATE TABLE sms_outbox (
      id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pool_id TEXT NOT NULL REFERENCES pools(id), saturday TEXT NOT NULL, game_id BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, provider_id TEXT,
      UNIQUE(user_id,pool_id,saturday,game_id)
    );

CREATE TABLE sms_final_events (
      pool_id TEXT NOT NULL, saturday TEXT NOT NULL, game_id BIGINT NOT NULL, first_seen BIGINT NOT NULL,
      PRIMARY KEY(pool_id,saturday,game_id)
    );




CREATE INDEX session_expiration ON sessions(expires_at);
























CREATE UNIQUE INDEX users_email_lower ON users (lower(email));
CREATE INDEX memberships_user ON memberships(user_id);
CREATE INDEX sms_pending ON sms_outbox(status, id);
CREATE OR REPLACE FUNCTION enforce_organizer_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'organizer' THEN
    PERFORM 1 FROM pools WHERE id=NEW.pool_id FOR UPDATE;
    IF (SELECT count(*) FROM memberships WHERE pool_id=NEW.pool_id AND role='organizer' AND user_id<>NEW.user_id) >= 2 THEN
      RAISE EXCEPTION 'Two organizers maximum' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizer_limit BEFORE INSERT OR UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION enforce_organizer_limit();
