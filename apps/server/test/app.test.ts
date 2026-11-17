// SPDX-License-Identifier: AGPL-3.0-or-later
// The HTTP API end to end on an in-memory database (needs the installed dependencies: runs in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadConfig } from '../src/config.ts';
import { migrate, openDatabase } from '../src/db/index.ts';
import { buildApp } from '../src/app.ts';
import { migrationsDir } from './sqlite.ts';

async function setup() {
  const sqlite = openDatabase('', ':memory:');
  migrate(sqlite, migrationsDir);
  const config = { ...loadConfig({}), publicDir: '/nonexistent', baseUrl: 'https://cashket.test' };
  return buildApp({ sqlite, config }, { logger: false });
}

/** A browser-like client that keeps the session cookie. */
function client(app: FastifyInstance) {
  let cookie = '';
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res: LightMyRequestResponse = await app.inject({ method, url, payload: payload as object, headers: cookie ? { cookie } : {} });
    const set = res.headers['set-cookie'];
    if (set) cookie = String(Array.isArray(set) ? set[0] : set).split(';')[0];
    return res;
  };
  return call;
}

test('health and status answer before setup', async () => {
  const app = await setup();
  assert.equal((await app.inject('/healthz')).statusCode, 200);
  const status = (await app.inject('/api/status')).json();
  assert.equal(status.name, 'Cashket');
  assert.equal(status.setupRequired, true);
  await app.close();
});

test('setup, invite, budget', async () => {
  const app = await setup();
  const admin = client(app);
  assert.equal((await admin('GET', '/api/me')).statusCode, 401);

  const me = await admin('POST', '/api/setup', { name: 'Anna', email: 'anna@casa.it', password: 'una password lunga' });
  assert.equal(me.json().role, 'admin');
  assert.equal((await admin('POST', '/api/setup', { name: 'X', email: 'x@casa.it', password: 'una password lunga' })).statusCode, 403);

  // Invite a second person.
  const invite = (await admin('POST', '/api/admin/invites', { email: 'bea@casa.it' })).json();
  assert.match(invite.url, /^https:\/\/cashket\.test\/register\?token=/);
  const bea = client(app);
  assert.equal((await bea('POST', '/api/register', { token: invite.token, name: 'Bea', email: 'altra@casa.it', password: 'una password lunga' })).statusCode, 403);
  const registered = await bea('POST', '/api/register', { token: invite.token, name: 'Bea', email: 'bea@casa.it', password: 'una password lunga' });
  assert.equal(registered.json().role, 'member');
  assert.equal((await bea('GET', '/api/admin/users')).statusCode, 403);

  // Anna's month.
  await admin('PATCH', '/api/me', { percentBase: 'current' });
  const conto = (await admin('POST', '/api/accounts', { name: 'Conto BPM', kind: 'checking' })).json();
  const spesa = (
    await admin('POST', '/api/buckets', {
      name: 'Spesa',
      icon: { kind: 'category', key: 'groceries' },
      kind: 'spend',
      fill: { type: 'fixed', amountCents: 45000 },
      goalCents: null,
      leftover: { type: 'carry' },
      overspend: { type: 'carry' }
    })
  ).json();
  assert.equal(spesa.name, 'Spesa');
  const bad = await admin('POST', '/api/buckets', { ...spesa, icon: { kind: 'category', key: 'nope' } });
  assert.equal(bad.statusCode, 400);

  await admin('POST', '/api/incomes', { accountId: conto.id, date: '2026-11-27', amountCents: 200000, description: 'Stipendio' });
  const view = (await admin('POST', '/api/budget/2026-11/allocate')).json();
  assert.equal(view.allocated, true);
  assert.equal(view.buckets.find((b: { id: number }) => b.id === spesa.id).balanceCents, 45000);
  assert.equal(view.unassignedCents, 0);

  // An expense typed offline and sent twice is saved once.
  const capture = { amountCents: 1250, spentAt: '2026-11-17T12:05:00.000Z', accountId: conto.id, note: 'Pranzo', clientId: 'phone-0001' };
  const first = (await admin('POST', '/api/captures', capture)).json();
  assert.equal((await admin('POST', '/api/captures', capture)).json().id, first.id);
  assert.deepEqual((await admin('GET', '/api/captures/summary')).json(), { count: 1, totalCents: 1250 });

  // Bea sees none of it.
  assert.equal((await bea('GET', '/api/captures')).json().length, 0);
  assert.equal((await bea('GET', `/api/buckets/${spesa.id}`)).statusCode, 404);
  assert.equal((await bea('GET', '/api/budget/2026-11')).json().incomeCents, 0);

  // Writes from another site are refused.
  const cross = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(cross.statusCode, 403);
  await app.close();
});
