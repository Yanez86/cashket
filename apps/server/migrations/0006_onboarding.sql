-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Cashket v0.7: the welcome tutorial. NULL = show it at the next sign-in. People already using Cashket
-- have set things up by hand, so they count as done.
ALTER TABLE users ADD COLUMN onboarded_at TEXT;
UPDATE users SET onboarded_at = created_at;
