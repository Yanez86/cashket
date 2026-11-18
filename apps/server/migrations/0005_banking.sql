-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Cashket v0.5: automatic import through Enable Banking (docs/SPEC.md §7.5). In restricted mode each person
-- uses their own Enable Banking application, so the credentials are per person, encrypted.
CREATE TABLE bank_apps (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  private_key_enc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE bank_connections ADD COLUMN aspsp_name TEXT;
ALTER TABLE bank_connections ADD COLUMN aspsp_country TEXT;
ALTER TABLE bank_connections ADD COLUMN session_id TEXT;
-- Random value sent to the bank and checked on the way back.
ALTER TABLE bank_connections ADD COLUMN state TEXT;
ALTER TABLE bank_connections ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
-- Set once the expiry warning was sent, so it is sent once.
ALTER TABLE bank_connections ADD COLUMN expiry_warned_at TEXT;
