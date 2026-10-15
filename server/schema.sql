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

-- Individual decisions take precedence over approved Telegram groups.
CREATE TABLE IF NOT EXISTS user_access (
  user_id bigint PRIMARY KEY CHECK (user_id > 0 AND user_id <= 9007199254740991),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 100),
  state text NOT NULL CHECK (state IN ('allowed', 'blocked')),
  updated_by bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Links support multiple groups per event; the organizer currently selects one.
CREATE TABLE IF NOT EXISTS event_groups (
  event_id text PRIMARY KEY,
  chat_ids bigint[] NOT NULL CHECK (
    cardinality(chat_ids) > 0 AND array_position(chat_ids, NULL) IS NULL
    AND 0 > ALL(chat_ids) AND -9007199254740991 <= ALL(chat_ids)
  ),
  updated_by bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Group members without a saved response are Pending. Only Going is confirmed.
CREATE TABLE IF NOT EXISTS event_responses (
  event_id text NOT NULL,
  user_id bigint NOT NULL CHECK (user_id > 0 AND user_id <= 9007199254740991),
  name text NOT NULL CHECK (length(name) <= 200),
  response text NOT NULL CHECK (response IN ('pending', 'going', 'not-going')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- Agreements apply across events. Keep the date of each version's first acceptance.
CREATE TABLE IF NOT EXISTS house_rules_acceptances (
  user_id bigint NOT NULL CHECK (user_id > 0 AND user_id <= 9007199254740991),
  rules_version text NOT NULL CHECK (length(rules_version) BETWEEN 1 AND 100),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_rule_ids text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, rules_version)
);

-- Existing agreements remain as history; the new version records individual rules.
ALTER TABLE house_rules_acceptances ADD COLUMN IF NOT EXISTS accepted_rule_ids text[] NOT NULL DEFAULT '{}';
