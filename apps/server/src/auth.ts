// SPDX-License-Identifier: AGPL-3.0-or-later
// Passwords and the session cookie. The SQL lives in services/access.ts.
import { hash, verify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Sqlite } from './db/core.ts';
import { forbidden, unauthorized } from './errors.ts';
import { createSession, deleteSession, sessionUser } from './services/access.ts';
import type { UserRow } from './services/users.ts';

export const SESSION_COOKIE = 'cashket_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

function setSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string, expiresAt: number) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Secure only when the request really came over HTTPS (directly or through a trusted proxy such as
    // cloudflared), so the app also works on a plain-HTTP LAN address.
    secure: request.protocol === 'https',
    expires: new Date(expiresAt)
  });
}

export function signIn(db: Sqlite, request: FastifyRequest, reply: FastifyReply, userId: number) {
  const { token, expiresAt } = createSession(db, userId, request.headers['user-agent'] ?? null);
  setSessionCookie(request, reply, token, expiresAt);
}

export function signOut(db: Sqlite, request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (token) deleteSession(db, token);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** The signed-in person, from the session cookie; renews the cookie when the session was extended. */
export function loadUser(db: Sqlite, request: FastifyRequest, reply: FastifyReply): UserRow | null {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const found = sessionUser(db, token);
  if (!found) return null;
  if (found.renewedUntil) setSessionCookie(request, reply, token, found.renewedUntil);
  return found.user;
}

export function requireUser(request: FastifyRequest): UserRow {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function requireAdmin(request: FastifyRequest): UserRow {
  const user = requireUser(request);
  if (user.role !== 'admin') throw forbidden();
  return user;
}
