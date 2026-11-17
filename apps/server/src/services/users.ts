// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Role, User } from '@cashket/shared';
import { insertedId, type Sqlite } from '../db/core.ts';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  locale: string;
  timezone: string;
  theme: User['theme'];
  percent_base: User['percentBase'];
  active: number;
}

export const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  active: !!r.active,
  locale: r.locale,
  timezone: r.timezone,
  theme: r.theme,
  percentBase: r.percent_base
});

export const countUsers = (db: Sqlite) => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;

export const countActiveAdmins = (db: Sqlite) =>
  (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get() as { n: number }).n;

export const findUserByEmail = (db: Sqlite, email: string) =>
  db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;

export const findUser = (db: Sqlite, id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  locale?: string;
  timezone?: string;
}

/** A new person starts with a cash account and a "Risparmio" bucket that takes what is left each month. */
export function createUser(db: Sqlite, u: NewUser): UserRow {
  return db.transaction(() => {
    const id = insertedId(
      db
        .prepare('INSERT INTO users (email, name, password_hash, role, locale, timezone) VALUES (?, ?, ?, ?, ?, ?)')
        .run(u.email.trim().toLowerCase(), u.name, u.passwordHash, u.role, u.locale ?? 'it', u.timezone ?? 'Europe/Rome')
    );
    db.prepare("INSERT INTO accounts (user_id, name, kind) VALUES (?, 'Contanti', 'cash')").run(id);
    db.prepare(
      "INSERT INTO buckets (user_id, name, category, kind, fill_type, leftover) VALUES (?, 'Risparmio', 'savings', 'saving', 'remainder', 'carry')"
    ).run(id);
    return findUser(db, id)!;
  });
}

const PROFILE_COLUMNS = { name: 'name', locale: 'locale', timezone: 'timezone', theme: 'theme', percentBase: 'percent_base' } as const;

export function updateProfile(db: Sqlite, id: number, patch: Partial<Pick<User, keyof typeof PROFILE_COLUMNS>>): UserRow {
  for (const [key, column] of Object.entries(PROFILE_COLUMNS)) {
    const value = patch[key as keyof typeof PROFILE_COLUMNS];
    if (value !== undefined) db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(value, id);
  }
  return findUser(db, id)!;
}
