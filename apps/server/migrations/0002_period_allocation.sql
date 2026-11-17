-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Cashket v0.2: remember when a period was filled and on which income, so the home can tell when the
-- income or the bucket rules changed since.
ALTER TABLE periods ADD COLUMN allocated_at TEXT;
ALTER TABLE periods ADD COLUMN allocated_income_cents INTEGER;
