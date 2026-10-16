-- One-time links sent by email: 'verify' (confirm the address, 24 hours) and
-- 'reset' (choose a new password, 30 minutes). Only the SHA-256 of the token
-- is stored, so a copy of the database cannot be used to open a link. A row is
-- deleted when it is used, so a link works once; issuing a new link of the
-- same purpose deletes the older ones.

CREATE TABLE email_tokens(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('verify', 'reset')),
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);
CREATE INDEX email_tokens_expiry ON email_tokens(expires_at);
