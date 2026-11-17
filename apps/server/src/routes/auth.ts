// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Status } from '@cashket/shared';
import type { AppContext } from '../app.ts';
import { SESSION_COOKIE, hashPassword, requireUser, signIn, signOut, verifyPassword } from '../auth.ts';
import { HttpError, conflict, forbidden } from '../http.ts';
import { deleteSessions, findValidInvite, markInviteUsed, randomToken, usePasswordReset } from '../services/access.ts';
import { countActiveAdmins, countUsers, createUser, findUserByEmail, toUser, updateProfile } from '../services/users.ts';
import { zEmail, zLocale, zName, zPassword, zTheme, zTimezone } from '../validation.ts';

const strict = { rateLimit: { max: 10, timeWindow: '5 minutes' } };

/**
 * Failed logins per account, whatever address they come from: after 5 in a row the account waits
 * 30 seconds, then twice as long after each further failure, up to 15 minutes (as in Mealler).
 */
function loginGuard(now = Date.now) {
  const FREE = 5;
  const MAX_WAIT = 15 * 60_000;
  const failures = new Map<string, { count: number; until: number; at: number }>();
  return {
    locked: (email: string) => (failures.get(email)?.until ?? 0) > now(),
    clear: (email: string) => void failures.delete(email),
    fail(email: string) {
      const f = failures.get(email) ?? { count: 0, until: 0, at: 0 };
      f.count++;
      f.at = now();
      if (f.count >= FREE) f.until = f.at + Math.min(2 ** (f.count - FREE) * 30_000, MAX_WAIT);
      failures.set(email, f);
      if (failures.size > 10_000) for (const [key, v] of failures) if (now() - v.at > MAX_WAIT) failures.delete(key);
      if (failures.size > 20_000) failures.clear();
    }
  };
}

export async function authRoutes(app: FastifyInstance, { sqlite: db, config }: AppContext) {
  const guard = loginGuard();
  // Checked for addresses with no account, so "unknown" and "wrong password" take the same time.
  let noAccountHash: Promise<string> | undefined;

  app.get('/status', async (): Promise<Status> => ({ name: 'Cashket', version: config.version, setupRequired: countUsers(db) === 0 }));

  const accountBody = z.object({
    name: zName,
    email: zEmail,
    password: zPassword,
    locale: zLocale.default('it'),
    timezone: zTimezone.default('Europe/Rome')
  });

  app.post('/setup', { config: strict }, async (request, reply) => {
    const body = accountBody.parse(request.body);
    // Before hashing, so a configured instance spends no CPU here; and again after, since hashing takes time.
    if (countUsers(db) > 0) throw forbidden('setupDone');
    const passwordHash = await hashPassword(body.password);
    if (countUsers(db) > 0) throw forbidden('setupDone');
    const user = createUser(db, { ...body, passwordHash, role: 'admin' });
    signIn(db, request, reply, user.id);
    return toUser(user);
  });

  app.post('/auth/login', { config: strict }, async (request, reply) => {
    const body = z.object({ email: zEmail, password: z.string().max(200) }).parse(request.body);
    if (guard.locked(body.email)) throw new HttpError(429, 'tooMany');
    const user = findUserByEmail(db, body.email);
    const ok = await verifyPassword(user?.password_hash ?? (await (noAccountHash ??= hashPassword(randomToken()))), body.password);
    if (!user || !ok || !user.active) {
      guard.fail(body.email);
      throw new HttpError(401, 'invalidCredentials');
    }
    guard.clear(body.email);
    signIn(db, request, reply, user.id);
    return toUser(user);
  });

  app.post('/auth/reset', { config: strict }, async (request) => {
    const body = z.object({ token: z.string().max(100), password: zPassword }).parse(request.body);
    const id = usePasswordReset(db, body.token, await hashPassword(body.password));
    if (id == null) throw forbidden('invalidReset');
    return { ok: true };
  });

  app.post('/auth/logout', async (request, reply) => {
    signOut(db, request, reply);
    return { ok: true };
  });

  // Cashket is for one household: people join only with an invite from an administrator.
  app.get('/invites/:token', async (request) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(request.params);
    const invite = findValidInvite(db, token);
    return { valid: !!invite, email: invite?.email ?? null };
  });

  app.post('/register', { config: strict }, async (request, reply) => {
    const body = accountBody.extend({ token: z.string().max(100) }).parse(request.body);
    const invite = findValidInvite(db, body.token);
    if (!invite) throw forbidden('invalidInvite');
    if (invite.email && invite.email.toLowerCase() !== body.email) throw forbidden('inviteEmailMismatch');
    if (findUserByEmail(db, body.email)) throw conflict('emailTaken');
    const passwordHash = await hashPassword(body.password);
    const user = db.transaction(() => {
      if (!findValidInvite(db, body.token)) throw forbidden('invalidInvite');
      markInviteUsed(db, body.token);
      return createUser(db, { ...body, passwordHash, role: 'member' });
    });
    signIn(db, request, reply, user.id);
    return toUser(user);
  });

  app.get('/me', async (request) => toUser(requireUser(request)));

  app.patch('/me', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({ name: zName, locale: zLocale, timezone: zTimezone, theme: zTheme, percentBase: z.enum(['current', 'previous']) })
      .partial()
      .parse(request.body);
    return toUser(updateProfile(db, user.id, body));
  });

  app.post('/me/password', { config: strict }, async (request) => {
    const user = requireUser(request);
    const body = z.object({ current: z.string().max(200), next: zPassword }).parse(request.body);
    if (!(await verifyPassword(user.password_hash, body.current))) throw new HttpError(400, 'wrongPassword');
    const passwordHash = await hashPassword(body.next);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
    // Whoever knew the old password is signed out everywhere else.
    deleteSessions(db, user.id, request.cookies[SESSION_COOKIE]);
    return { ok: true };
  });

  // Deleting one's own account removes every piece of one's data.
  app.delete('/me', { config: strict }, async (request, reply) => {
    const user = requireUser(request);
    const { password } = z.object({ password: z.string().max(200) }).parse(request.body ?? {});
    if (!(await verifyPassword(user.password_hash, password))) throw new HttpError(400, 'wrongPassword');
    if (user.role === 'admin' && countActiveAdmins(db) <= 1 && countUsers(db) > 1) throw new HttpError(400, 'lastAdmin');
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    signOut(db, request, reply);
    return { ok: true };
  });
}
