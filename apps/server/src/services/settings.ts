// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Sqlite } from '../db/core.ts';

export const getSetting = (db: Sqlite, key: string) =>
  (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;

export const setSetting = (db: Sqlite, key: string, value: string) =>
  void db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
