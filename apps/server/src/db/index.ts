// SPDX-License-Identifier: AGPL-3.0-or-later
// SQLite through better-sqlite3, behind the interface in core.ts. migrations/*.sql are the source of truth.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Sqlite, Statement } from './core.ts';

export * from './core.ts';

export function openDatabase(dataDir: string, fileName = 'cashket.db'): Sqlite {
  const path = fileName === ':memory:' ? ':memory:' : join(dataDir, fileName);
  if (path !== ':memory:') mkdirSync(dataDir, { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return {
    prepare: (sql) => db.prepare(sql) as unknown as Statement,
    exec: (sql) => void db.exec(sql),
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
    close: () => db.close()
  };
}
