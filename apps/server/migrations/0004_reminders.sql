-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Cashket v0.4: session reminders (docs/SPEC.md §5.2). Sent once a day at most, at the chosen hour.
ALTER TABLE users ADD COLUMN reminder_hour INTEGER NOT NULL DEFAULT 19;
ALTER TABLE users ADD COLUMN last_reminded_on TEXT;
