// SPDX-License-Identifier: AGPL-3.0-or-later
// Enable Banking against a fake API: JWT, linking, mapping, downloading with pages, renewal, expiry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import { memoryDb } from './sqlite.ts';
import { createUser } from '../src/services/users.ts';
import { createAccount } from '../src/services/accounts.ts';
import { createSecretBox } from '../src/secrets.ts';
import { sessionView } from '../src/services/session.ts';
import {
  bankApp,
  expiringConnections,
  finishAuth,
  listConnections,
  makeJwt,
  mapAccount,
  saveBankApp,
  startAuth,
  syncConnection,
  toImportRow,
  type BankingDeps
} from '../src/services/banking.ts';
import type { HttpError } from '../src/errors.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

test('jwt: RS256, kid, iss and aud', () => {
  const jwt = makeJwt('app-123', pem, Date.UTC(2026, 10, 18));
  const [head, body, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url').toString()), { typ: 'JWT', alg: 'RS256', kid: 'app-123' });
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.equal(claims.iss, 'enablebanking.com');
  assert.equal(claims.aud, 'api.enablebanking.com');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(verify('RSA-SHA256', Buffer.from(`${head}.${body}`), createPublicKey(privateKey), Buffer.from(sig, 'base64url')));
});

test('transactions become import rows', () => {
  assert.deepEqual(
    toImportRow({
      transaction_amount: { amount: '54.30', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      booking_date: '2026-11-17',
      value_date: '2026-11-17',
      creditor: { name: 'ESSELUNGA SPA' },
      remittance_information: ['POS 16/11 MILANO'],
      entry_reference: 'E1'
    }),
    { date: '2026-11-17', valueDate: '2026-11-17', amountCents: -5430, description: 'ESSELUNGA SPA POS 16/11 MILANO', externalId: 'E1' }
  );
  assert.equal(toImportRow({ transaction_amount: { amount: '2350' }, credit_debit_indicator: 'CRDT', booking_date: '2026-11-27' })?.amountCents, 235000);
  assert.equal(toImportRow({ transaction_amount: { amount: '0' }, booking_date: '2026-11-27' }), null);
});

test('link a bank, map an account, download two pages, renew', async () => {
  const db = memoryDb();
  const user = createUser(db, { name: 'Anna', email: 'anna@casa.it', passwordHash: 'x', role: 'admin' });
  const bpm = createAccount(db, user.id, { name: 'Conto BPM', kind: 'checking', settlesToAccountId: null });
  const calls: { method: string; url: string; body: unknown }[] = [];
  let sessionNo = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: String(init.method), url, body });
    assert.match(String((init.headers as Record<string, string>).Authorization), /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.endsWith('/auth')) return json({ url: `https://bank.example/consent?state=${body.state}` });
    if (url.endsWith('/sessions'))
      return json({ session_id: `s${++sessionNo}`, accounts: [{ uid: `u${sessionNo}`, account_id: { iban: 'IT60X0542811101000000123456' }, name: 'Conto corrente' }], access: { valid_until: '2027-05-17T00:00:00Z' } });
    if (url.includes('/transactions') && !url.includes('continuation_key'))
      return json({ transactions: [{ transaction_amount: { amount: '45.00' }, credit_debit_indicator: 'DBIT', booking_date: '2026-11-16', remittance_information: ['ENI STATION'], entry_reference: 'A' }], continuation_key: 'next' });
    if (url.includes('/transactions'))
      return json({ transactions: [{ transaction_amount: { amount: '13.00' }, credit_debit_indicator: 'DBIT', booking_date: '2026-11-17', remittance_information: ['RISTORANTE DA LUIGI'], entry_reference: 'B' }, { transaction_amount: { amount: '9' }, credit_debit_indicator: 'DBIT', booking_date: '2026-11-18', status: 'PDNG' }], continuation_key: null });
    return new Response('{"message":"unexpected"}', { status: 404 });
  }) as unknown as typeof fetch;
  const deps: BankingDeps = { db, box: createSecretBox(randomBytes(32)), baseUrl: 'https://cashket.test', fetch: fakeFetch, now: () => Date.UTC(2026, 10, 18) };
  const code = async (p: Promise<unknown>) => p.then(() => 'none', (e: HttpError) => e.code);

  assert.equal(await code(startAuth(deps, user.id, { name: 'Banco BPM', country: 'IT', maxConsentDays: null })), 'bankAppMissing');
  assert.throws(() => saveBankApp(deps, user.id, 'app-1', 'not a key'));
  assert.equal(saveBankApp(deps, user.id, 'app-1', pem).redirectUrl, 'https://cashket.test/api/banking/callback');
  assert.equal(bankApp(deps, user.id).configured, true);

  const { url } = await startAuth(deps, user.id, { name: 'Banco BPM', country: 'IT', maxConsentDays: 180 });
  const state = new URL(url).searchParams.get('state')!;
  assert.equal((calls[0].body as { redirect_url: string }).redirect_url, 'https://cashket.test/api/banking/callback');
  assert.equal(await code(finishAuth(deps, user.id, 'wrong', 'c')), 'bankState');
  const conn = await finishAuth(deps, user.id, state, 'code-1');
  assert.equal(conn.status, 'active');
  assert.equal(conn.accounts[0].iban, 'IT60X0542811101000000123456');

  // Nothing mapped yet: nothing downloaded.
  assert.deepEqual(await syncConnection(deps, user.id, conn.id), { added: 0 });
  mapAccount(db, user.id, conn.id, 'u1', bpm.id);
  assert.deepEqual(await syncConnection(deps, user.id, conn.id), { added: 2 });
  assert.match(calls.at(-1)!.url, /continuation_key=next/);
  assert.deepEqual(sessionView(db, { ...user, unmatched_after_days: 10 }).lines.map((l) => l.description), ['Ristorante Da Luigi', 'Eni Station']);
  // Again: doubles skipped by their bank reference, no empty batch left behind.
  assert.deepEqual(await syncConnection(deps, user.id, conn.id), { added: 0 });
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM import_batches WHERE source = 'api'").get() as { n: number }).n, 1);

  // Renewing consent replaces the connection and keeps the account choice.
  const again = await startAuth(deps, user.id, { name: 'Banco BPM', country: 'IT', maxConsentDays: 180 });
  const renewed = await finishAuth(deps, user.id, new URL(again.url).searchParams.get('state')!, 'code-2');
  const list = listConnections(db, user.id);
  assert.equal(list.length, 1);
  assert.equal(renewed.accounts[0].accountId, bpm.id);

  // A week before the end of consent it is flagged once.
  assert.equal(expiringConnections(db, Date.parse('2027-05-12T00:00:00Z')).length, 1);
  assert.equal(expiringConnections(db, Date.parse('2027-04-01T00:00:00Z')).length, 0);
});
