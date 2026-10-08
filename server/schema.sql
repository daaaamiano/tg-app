CREATE TABLE IF NOT EXISTS app_sessions (
  namespace text NOT NULL,
  token_hash text NOT NULL,
  user_profile jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, token_hash)
);

CREATE TABLE IF NOT EXISTS login_challenges (
  namespace text NOT NULL,
  token_hash text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, token_hash)
);

CREATE TABLE IF NOT EXISTS login_windows (
  namespace text NOT NULL,
  window_start bigint NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (namespace, window_start)
);

-- The next group-authorization step uses this same database.
CREATE TABLE IF NOT EXISTS approved_groups (
  chat_id bigint PRIMARY KEY,
  title text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  updated_by bigint,
  updated_at timestamptz NOT NULL DEFAULT now()
);
