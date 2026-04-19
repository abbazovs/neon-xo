-- NEON XO database schema
-- Runs idempotently: safe to re-run on existing databases.

-- Users (registered accounts only)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(20) NOT NULL UNIQUE,
  username_lower VARCHAR(20) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_id     SMALLINT NOT NULL DEFAULT 0,
  language      VARCHAR(5) NOT NULL DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Aggregated stats (denormalized for fast leaderboard queries)
  games_played   INT NOT NULL DEFAULT 0,
  games_won      INT NOT NULL DEFAULT 0,
  games_lost     INT NOT NULL DEFAULT 0,
  games_drawn    INT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(username_lower);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);

-- Leaderboard view (win rate, 25+ games minimum)
CREATE OR REPLACE VIEW leaderboard_global AS
SELECT
  id,
  username,
  avatar_id,
  games_played,
  games_won,
  games_lost,
  games_drawn,
  longest_streak,
  CASE WHEN games_played > 0
       THEN ROUND((games_won::numeric / games_played) * 100, 2)
       ELSE 0 END AS win_rate
FROM users
WHERE games_played >= 25
ORDER BY win_rate DESC, games_played DESC;

-- Friendships (bidirectional, stored as single row with canonical ordering)
CREATE TABLE IF NOT EXISTS friendships (
  user_a_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b_id);

-- Friend-invite links (shareable)
CREATE TABLE IF NOT EXISTS friend_invites (
  token      VARCHAR(32) PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_friend_invites_user ON friend_invites(user_id);

-- Matches (completed/abandoned games)
-- Series matches (BO3/BO5) store ONE row for the whole series.
CREATE TABLE IF NOT EXISTS matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(12) NOT NULL UNIQUE,
  player1_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  player2_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  player1_name     VARCHAR(40) NOT NULL,
  player2_name     VARCHAR(40),
  board_size       SMALLINT NOT NULL DEFAULT 3,
  format           VARCHAR(10) NOT NULL DEFAULT 'single', -- single | bo3 | bo5
  timer_seconds    SMALLINT NOT NULL DEFAULT 0,           -- 0 = no timer
  status           VARCHAR(20) NOT NULL DEFAULT 'waiting', -- waiting | active | finished | abandoned | voided
  winner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  result           VARCHAR(20),                            -- p1_win | p2_win | draw | abandoned
  end_reason       VARCHAR(30),                            -- normal | surrender | disconnect | timeout | both_disconnect
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_matches_code ON matches(code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_p1 ON matches(player1_user_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_p2 ON matches(player2_user_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_cleanup ON matches(status, created_at)
  WHERE status IN ('waiting', 'abandoned', 'voided');

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_version (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;
