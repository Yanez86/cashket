// SPDX-License-Identifier: AGPL-3.0-or-later
// The Sqlite interface on Node's built-in SQLite, so the services run in tests without native modules.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { migrate, type Sqlite, type Statement } from '../src/db/core.ts';

export const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

export function memoryDb(): Sqlite {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  let depth = 0;
  const sqlite: Sqlite = {
    prepare: (sql) => db.prepare(sql) as unknown as Statement,
    exec: (sql) => db.exec(sql),
    transaction<T>(fn: () => T): T {
      const name = `sp${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (e) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => db.close()
  };
  migrate(sqlite, migrationsDir);
  return sqlite;
}

/** A person as Cashket made them before the tutorial existed: a cash account and a "Risparmio" bucket. */
export function seed(db: Sqlite, userId: number) {
  db.prepare("INSERT INTO accounts (user_id, name, kind) VALUES (?, 'Contanti', 'cash')").run(userId);
  db.prepare("INSERT INTO buckets (user_id, name, category, kind, fill_type, leftover) VALUES (?, 'Risparmio', 'savings', 'saving', 'remainder', 'carry')").run(userId);
}
