// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './sqlite.ts';
import { createUser, findUser } from '../src/services/users.ts';
import {
  DAY_MS,
  createInvite,
  createPasswordReset,
  createSession,
  deleteSessions,
  findValidInvite,
  listInvites,
  markInviteUsed,
  sessionUser,
  usePasswordReset
} from '../src/services/access.ts';

test('sessions: found while valid, renewed past half-life, closed by password reset', () => {
  const db = memoryDb();
  const u = createUser(db, { name: 'A', email: 'a@casa.it', passwordHash: 'old', role: 'admin' });
  const now = Date.now();
  const s = createSession(db, u.id, 'phone', now);
  assert.equal(sessionUser(db, s.token, now)?.user.email, 'a@casa.it');
  assert.equal(sessionUser(db, s.token, now)?.renewedUntil, null);
  assert.ok(sessionUser(db, s.token, now + 20 * DAY_MS)?.renewedUntil);
  assert.equal(sessionUser(db, 'nope', now), null);

  const other = createSession(db, u.id, 'laptop', now);
  deleteSessions(db, u.id, s.token);
  assert.ok(sessionUser(db, s.token, now));
  assert.equal(sessionUser(db, other.token, now), null);

  const token = createPasswordReset(db, u.id, now);
  assert.equal(usePasswordReset(db, 'wrong', 'new', now), null);
  assert.equal(usePasswordReset(db, token, 'new', now), u.id);
  assert.equal(findUser(db, u.id)?.password_hash, 'new');
  assert.equal(sessionUser(db, s.token, now), null);
  assert.equal(usePasswordReset(db, token, 'again', now), null);
});

test('sessions: an inactive person is out', () => {
  const db = memoryDb();
  const u = createUser(db, { name: 'A', email: 'a@casa.it', passwordHash: 'x', role: 'admin' });
  const s = createSession(db, u.id, null);
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(u.id);
  assert.equal(sessionUser(db, s.token), null);
});

test('invites: valid once, until they expire', () => {
  const db = memoryDb();
  const u = createUser(db, { name: 'A', email: 'a@casa.it', passwordHash: 'x', role: 'admin' });
  const now = Date.now();
  const token = createInvite(db, u.id, 'b@casa.it', now);
  assert.equal(findValidInvite(db, token, now)?.email, 'b@casa.it');
  assert.equal(findValidInvite(db, token, now + 8 * DAY_MS), undefined);
  assert.equal(listInvites(db, 'https://cashket.test', now)[0].url, `https://cashket.test/register?token=${token}`);
  markInviteUsed(db, token);
  assert.equal(findValidInvite(db, token, now), undefined);
  assert.equal(listInvites(db, 'x', now).length, 0);
});
