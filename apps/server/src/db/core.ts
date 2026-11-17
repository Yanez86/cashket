// SPDX-License-Identifier: AGPL-3.0-or-later
// The small Sqlite interface everything above the driver talks to, with positional `?` parameters, and the
// migration runner. No dependencies: the services can be tested on Node's built-in SQLite (test/sqlite.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): RunResult;
}

export interface Sqlite {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  /** Runs fn inside a transaction and returns what it returns; rolls back if it throws. */
  transaction<T>(fn: () => T): T;
  close(): void;
}

/** Applies every migrations/NNNN_*.sql file not yet recorded, each in its own transaction. */
export function migrate(sqlite: Sqlite, migrationsDir: string): string[] {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set((sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name));
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    });
    done.push(file);
  }
  return done;
}

/** Integer id of a row just inserted. */
export const insertedId = (r: RunResult) => Number(r.lastInsertRowid);
