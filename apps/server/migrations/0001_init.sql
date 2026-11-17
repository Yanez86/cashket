-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Cashket v0.1 initial schema. See docs/SPEC.md §8.
-- Amounts are integer cents (negative = money going out). Dates are 'YYYY-MM-DD', timestamps ISO UTC.

-- ---------------------------------------------------------------- people and access (as in Mealler)

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  locale TEXT NOT NULL DEFAULT 'it',
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  -- Which entries count for percentage buckets: this month's or last month's (docs/SPEC.md §4.3).
  percent_base TEXT NOT NULL DEFAULT 'previous' CHECK (percent_base IN ('current', 'previous')),
  -- Days after which a queued expense with no bank match is flagged (§5.4).
  unmatched_after_days INTEGER NOT NULL DEFAULT 10,
  -- Session reminder: NULL = off, otherwise days since the last session.
  session_reminder_days INTEGER,
  last_session_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  email TEXT,
  expires_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- Encrypted secrets (e.g. open banking keys), as Mealler keeps the Anthropic key.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------- accounts and buckets

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checking', 'card', 'paypal', 'cash')),
  -- For a card: the account its monthly statement is charged to (the charge there is a transfer).
  settles_to_account_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX accounts_user ON accounts (user_id, archived, position);

CREATE TABLE buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- A ready-made category key, or NULL with custom_letter and custom_color set.
  category TEXT,
  custom_letter TEXT,
  custom_color TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('spend', 'saving')),
  fill_type TEXT NOT NULL CHECK (fill_type IN ('fixed', 'percent', 'remainder')),
  fill_amount_cents INTEGER,
  -- Basis points: 1000 = 10%.
  fill_percent_bp INTEGER,
  goal_cents INTEGER,
  leftover TEXT NOT NULL DEFAULT 'carry' CHECK (leftover IN ('carry', 'move', 'reset')),
  leftover_to_bucket_id INTEGER REFERENCES buckets (id) ON DELETE SET NULL,
  leftover_percent_bp INTEGER NOT NULL DEFAULT 10000,
  overspend TEXT NOT NULL DEFAULT 'carry' CHECK (overspend IN ('carry', 'cover')),
  overspend_from_bucket_id INTEGER REFERENCES buckets (id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (category IS NOT NULL OR (custom_letter IS NOT NULL AND custom_color IS NOT NULL)),
  CHECK (fill_type <> 'fixed' OR fill_amount_cents IS NOT NULL),
  CHECK (fill_type <> 'percent' OR fill_percent_bp IS NOT NULL)
);
CREATE INDEX buckets_user ON buckets (user_id, archived, position);
-- At most one "remainder" bucket per person.
CREATE UNIQUE INDEX buckets_one_remainder ON buckets (user_id) WHERE fill_type = 'remainder' AND archived = 0;

CREATE TABLE periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month TEXT NOT NULL,              -- 'YYYY-MM'
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TEXT,
  UNIQUE (user_id, month)
);

-- ---------------------------------------------------------------- capture queue

CREATE TABLE captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  spent_at TEXT NOT NULL,           -- ISO timestamp of the purchase
  account_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'matched', 'cash', 'discarded')),
  -- Id made by the phone for an expense typed offline, so a retried sync never adds it twice.
  client_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, client_id)
);
CREATE INDEX captures_queue ON captures (user_id, status, spent_at);

-- ---------------------------------------------------------------- imports and transactions

CREATE TABLE import_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx', 'ofx', 'camt053')),
  -- Column mapping, date and number format, rows to skip, sign, header fingerprint (JSON).
  mapping TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE bank_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('enablebanking', 'email')),
  -- Provider ids of the linked accounts mapped to our accounts (JSON).
  accounts TEXT NOT NULL DEFAULT '{}',
  consent_expires_at TEXT,
  last_fetched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('csv', 'api', 'email')),
  profile_id INTEGER REFERENCES import_profiles (id) ON DELETE SET NULL,
  connection_id INTEGER REFERENCES bank_connections (id) ON DELETE SET NULL,
  file_name TEXT,
  file_sha256 TEXT,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_new INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  batch_id INTEGER REFERENCES import_batches (id) ON DELETE CASCADE,
  -- Set for a cash expense that came straight from the queue (no bank line).
  capture_id INTEGER REFERENCES captures (id) ON DELETE SET NULL,
  date TEXT NOT NULL,               -- operation date, used for matching
  value_date TEXT,
  amount_cents INTEGER NOT NULL,
  description_raw TEXT NOT NULL,
  description TEXT NOT NULL,        -- cleaned: "Esselunga"
  external_id TEXT,                 -- bank's own id, when it gives one
  fingerprint TEXT NOT NULL,        -- see docs/SPEC.md §7.3
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income', 'transfer')),
  budget_base INTEGER NOT NULL DEFAULT 0,   -- income that counts for percentage buckets
  provisional INTEGER NOT NULL DEFAULT 0,   -- from a notification email, until the real line arrives
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (account_id, fingerprint)
);
CREATE INDEX transactions_user_date ON transactions (user_id, date);
CREATE INDEX transactions_review ON transactions (user_id, status);

-- One queued expense ↔ one bank line.
CREATE TABLE matches (
  capture_id INTEGER NOT NULL UNIQUE REFERENCES captures (id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  score INTEGER NOT NULL,           -- 0–100
  origin TEXT NOT NULL CHECK (origin IN ('auto', 'user')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (capture_id, transaction_id)
);

-- Lines that are the same money seen twice: card charge on the current account, ATM withdrawal,
-- PayPal and the card that funded it.
CREATE TABLE transfer_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('card_settlement', 'withdrawal', 'paypal_funding', 'other')),
  from_transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  to_transaction_id INTEGER REFERENCES transactions (id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('auto', 'user')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------- the bucket ledger

-- A bucket's balance is the sum of its entries; nothing else stores a balance (§4.5).
CREATE TABLE budget_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bucket_id INTEGER NOT NULL REFERENCES buckets (id),
  period_id INTEGER NOT NULL REFERENCES periods (id),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('allocation', 'spend', 'move', 'rollover')),
  transaction_id INTEGER REFERENCES transactions (id) ON DELETE CASCADE,
  -- The two halves of a move or rollover share a group id.
  group_id TEXT,
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'rule', 'system')),
  rule_id INTEGER REFERENCES rules (id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX budget_entries_bucket ON budget_entries (bucket_id, period_id);
CREATE INDEX budget_entries_transaction ON budget_entries (transaction_id);

CREATE TABLE rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Case-insensitive text the raw description must contain, optionally limited to one account.
  pattern TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts (id) ON DELETE CASCADE,
  bucket_id INTEGER REFERENCES buckets (id) ON DELETE CASCADE,
  set_kind TEXT CHECK (set_kind IN ('expense', 'income', 'transfer')),
  set_budget_base INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (bucket_id IS NOT NULL OR set_kind IS NOT NULL OR set_budget_base IS NOT NULL)
);
CREATE INDEX rules_user ON rules (user_id);
