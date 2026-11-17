// SPDX-License-Identifier: AGPL-3.0-or-later
// Sessions, invites and password-reset links, as in Mealler. Tokens are stored hashed; the plain token only
// ever lives in the cookie or the link handed to the person.
import { createHash, randomBytes } from 'node:crypto';
import type { Invite } from '@cashket/shared';
import type { Sqlite } from '../db/core.ts';
import type { UserRow } from './users.ts';

export const SESSION_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_DAYS = 7;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

// ---------------------------------------------------------------- sessions

/** Stores a new session and returns its token and expiry, for the cookie. */
export function createSession(db: Sqlite, userId: number, userAgent: string | null, now = Date.now()) {
  const token = randomToken();
  const expiresAt = now + SESSION_DAYS * DAY_MS;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)').run(sha256(token), userId, expiresAt, userAgent?.slice(0, 300) ?? null);
  return { token, expiresAt };
}

/**
 * The active user behind a session token. A session past half its life is extended: the result then
 * carries the new expiry, so the cookie can be renewed too.
 */
export function sessionUser(db: Sqlite, token: string, now = Date.now()): { user: UserRow; renewedUntil: number | null } | null {
  const row = db
    .prepare('SELECT s.id AS session_id, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?')
    .get(sha256(token), now) as (UserRow & { session_id: string; expires_at: number }) | undefined;
  if (!row || !row.active) return null;
  const { session_id, expires_at, ...user } = row;
  if (expires_at - now < (SESSION_DAYS / 2) * DAY_MS) {
    const renewed = now + SESSION_DAYS * DAY_MS;
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(renewed, session_id);
    return { user: user as UserRow, renewedUntil: renewed };
  }
  return { user: user as UserRow, renewedUntil: null };
}

export const deleteSession = (db: Sqlite, token: string) => void db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));

/** Signs a person out everywhere, except the session whose token is given. */
export function deleteSessions(db: Sqlite, userId: number, keepToken?: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, keepToken ? sha256(keepToken) : '');
}

// ---------------------------------------------------------------- invites

interface InviteRow {
  token: string;
  email: string | null;
  expires_at: number;
  used_at: string | null;
}

export function createInvite(db: Sqlite, createdBy: number, email: string | null, now = Date.now()): string {
  const token = randomToken(18);
  db.prepare('INSERT INTO invites (token, email, expires_at, created_by) VALUES (?, ?, ?, ?)').run(token, email, now + INVITE_DAYS * DAY_MS, createdBy);
  return token;
}

export const findValidInvite = (db: Sqlite, token: string, now = Date.now()) =>
  db.prepare('SELECT * FROM invites WHERE token = ? AND used_at IS NULL AND expires_at > ?').get(token, now) as InviteRow | undefined;

export const markInviteUsed = (db: Sqlite, token: string) =>
  void db.prepare('UPDATE invites SET used_at = ? WHERE token = ?').run(new Date().toISOString(), token);

export function listInvites(db: Sqlite, origin: string, now = Date.now()): Invite[] {
  return (db.prepare('SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC').all(now) as InviteRow[]).map((r) => ({
    token: r.token,
    email: r.email,
    expiresAt: new Date(r.expires_at).toISOString(),
    url: `${origin}/register?token=${r.token}`
  }));
}

export const deleteInvite = (db: Sqlite, token: string) => void db.prepare('DELETE FROM invites WHERE token = ?').run(token);

// ---------------------------------------------------------------- password resets

/** A one-time token to set a new password within 24 hours; it replaces any earlier one for the same person. */
export function createPasswordReset(db: Sqlite, userId: number, now = Date.now()): string {
  const token = randomToken();
  db.transaction(() => {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, now + DAY_MS);
  });
  return token;
}

/** Sets the password chosen with a reset token and signs the person out everywhere. Returns their id, or null. */
export function usePasswordReset(db: Sqlite, token: string, passwordHash: string, now = Date.now()): number | null {
  return db.transaction(() => {
    const reset = db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?').get(sha256(token), now) as
      | { user_id: number }
      | undefined;
    if (!reset) return null;
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(reset.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id);
    return reset.user_id;
  });
}
