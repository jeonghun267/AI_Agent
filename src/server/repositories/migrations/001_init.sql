-- ReLo B2C schema. Every user-owned row carries owner_id; queries always
-- filter by it. Ledger, drafts and audit are append-only except during an
-- account purge (a row in purges for that owner, inside one transaction).

CREATE TABLE users(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  ai_consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE claims(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  data_rev INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, owner_id)
);
CREATE INDEX claims_owner ON claims(owner_id, deleted_at, updated_at);

CREATE TABLE files(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(id, owner_id),
  FOREIGN KEY(claim_id, owner_id) REFERENCES claims(id, owner_id)
);
CREATE INDEX files_claim ON files(owner_id, claim_id);

CREATE TABLE ledger(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('cash', 'goods', 'repair', 'reversal')),
  amount INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  received_on TEXT NOT NULL,
  note TEXT NOT NULL,
  proof_id TEXT NOT NULL,
  reverses TEXT,
  transaction_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(id, owner_id),
  FOREIGN KEY(claim_id, owner_id) REFERENCES claims(id, owner_id),
  FOREIGN KEY(proof_id, owner_id) REFERENCES files(id, owner_id)
);
CREATE INDEX ledger_claim ON ledger(owner_id, claim_id);
CREATE UNIQUE INDEX ledger_cash_ref ON ledger(owner_id, transaction_ref) WHERE kind = 'cash' AND transaction_ref <> '';
CREATE UNIQUE INDEX ledger_one_reversal ON ledger(owner_id, reverses) WHERE reverses IS NOT NULL;

CREATE TABLE drafts(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  body TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('ai', 'template', 'manual')),
  model TEXT NOT NULL DEFAULT '',
  data_rev INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(id, owner_id),
  FOREIGN KEY(claim_id, owner_id) REFERENCES claims(id, owner_id)
);
CREATE INDEX drafts_claim ON drafts(owner_id, claim_id);

CREATE TABLE draft_submissions(
  draft_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  FOREIGN KEY(draft_id, owner_id) REFERENCES drafts(id, owner_id)
);

CREATE TABLE audit(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX audit_entity ON audit(owner_id, entity);

CREATE TABLE idempotency(
  owner_id TEXT NOT NULL,
  key TEXT NOT NULL,
  action TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, key)
);

CREATE TABLE ai_usage(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  claim_id TEXT,
  capability TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL,
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX ai_usage_owner_time ON ai_usage(owner_id, created_at);

CREATE TABLE purges(owner_id TEXT PRIMARY KEY);

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT, 'append-only audit'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit
WHEN NOT EXISTS (SELECT 1 FROM purges WHERE owner_id = OLD.owner_id)
BEGIN SELECT RAISE(ABORT, 'append-only audit'); END;

CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'append-only ledger'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
WHEN NOT EXISTS (SELECT 1 FROM purges WHERE owner_id = OLD.owner_id)
BEGIN SELECT RAISE(ABORT, 'append-only ledger'); END;

CREATE TRIGGER drafts_no_update BEFORE UPDATE ON drafts
BEGIN SELECT RAISE(ABORT, 'immutable draft'); END;
CREATE TRIGGER drafts_no_delete BEFORE DELETE ON drafts
WHEN NOT EXISTS (SELECT 1 FROM purges WHERE owner_id = OLD.owner_id)
BEGIN SELECT RAISE(ABORT, 'immutable draft'); END;
