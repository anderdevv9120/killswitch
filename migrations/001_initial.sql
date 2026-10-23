CREATE TABLE IF NOT EXISTS switches (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  disabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_login_throttle (
  id integer PRIMARY KEY CHECK (id = 1),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 5),
  window_started_at timestamptz NOT NULL DEFAULT now()
);
