-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Cashket v0.3: the reconciliation session. A pairing the person said "no" to is never proposed again.
CREATE TABLE match_rejections (
  capture_id INTEGER NOT NULL REFERENCES captures (id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  PRIMARY KEY (capture_id, transaction_id)
);

-- Profiles are found by the column names of the file (docs/SPEC.md §7.1).
ALTER TABLE import_profiles ADD COLUMN header_fingerprint TEXT;
CREATE INDEX import_profiles_header ON import_profiles (user_id, account_id, header_fingerprint);
