// SPDX-License-Identifier: AGPL-3.0-or-later
// Import and reconciliation on an in-memory database: the whole session, as a person would do it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMapping, guessMapping, headerFingerprint, parseCsv, type BucketInput } from '@cashket/shared';
import { memoryDb, seed } from './sqlite.ts';
import { createUser, findUser, updateProfile } from '../src/services/users.ts';
import { createAccount, listAccounts } from '../src/services/accounts.ts';
import { createBucket, listBuckets } from '../src/services/buckets.ts';
import { createCapture, listQueue } from '../src/services/captures.ts';
import { importRows, listProfiles, undoBatch } from '../src/services/imports.ts';
import { assignLine, closeSession, confirmMatch, prepareSession, rejectMatch, sessionView, setLineKind } from '../src/services/session.ts';
import { budgetView } from '../src/services/budget.ts';
import type { HttpError } from '../src/errors.ts';

const CSV = `Data contabile;Data valuta;Descrizione;Dare;Avere
16/11/2026;16/11/2026;POS 16/11 ENI STATION 0431 CARTA *1234;45,00;
17/11/2026;17/11/2026;RISTORANTE DA LUIGI;13,00;
17/11/2026;17/11/2026;POS 17/11 ESSELUNGA MILANO 0431;54,30;
18/11/2026;18/11/2026;PRELIEVO ATM;100,00;
19/11/2026;19/11/2026;ADDEBITO ESTRATTO CONTO NEXI;250,00;
27/11/2026;27/11/2026;BONIFICO STIPENDIO ACME;;2.350,00
`;

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as HttpError).code;
  }
  return 'none';
};

const spend = (name: string): BucketInput => ({
  name,
  icon: { kind: 'category', key: 'groceries' },
  kind: 'spend',
  fill: { type: 'fixed', amountCents: 10000 },
  goalCents: null,
  leftover: { type: 'carry' },
  overspend: { type: 'carry' }
});

function setup() {
  const db = memoryDb();
  const created = createUser(db, { name: 'Anna', email: 'anna@casa.it', passwordHash: 'x', role: 'admin', timezone: 'Europe/Rome' });
  seed(db, created.id);
  const user = updateProfile(db, created.id, { percentBase: 'current' });
  const bpm = createAccount(db, user.id, { name: 'Conto BPM', kind: 'checking', settlesToAccountId: null });
  createAccount(db, user.id, { name: 'Nexi', kind: 'card', settlesToAccountId: bpm.id });
  const cash = listAccounts(db, user.id).find((a) => a.kind === 'cash')!;
  const table = parseCsv(CSV);
  const mapping = guessMapping(table, ';');
  const rows = applyMapping(table, mapping).rows;
  const input = { accountId: bpm.id, fileName: 'bpm.csv', fileSha256: null, rows, profile: { headerFingerprint: headerFingerprint(table[0]), mapping } };
  return { db, user, bpm, cash, input };
}

test('import: classifies, skips doubles, saves the profile, undoes', () => {
  const { db, user, input } = setup();
  const batch = importRows(db, user.id, input);
  assert.deepEqual([batch.rowsRead, batch.rowsNew, batch.rowsSkipped], [6, 6, 0]);
  const kinds = sessionView(db, user).lines.map((l) => [l.description, l.kind, l.transferKind]);
  assert.deepEqual(kinds, [
    ['Bonifico Stipendio Acme', 'income', null],
    ['Addebito Estratto Conto Nexi', 'transfer', 'card_settlement'],
    ['Prelievo Atm', 'transfer', 'withdrawal'],
    ['Esselunga Milano', 'expense', null],
    ['Ristorante Da Luigi', 'expense', null],
    ['Eni Station', 'expense', null]
  ]);
  // The same file again (or overlapping): nothing new.
  const again = importRows(db, user.id, input);
  assert.deepEqual([again.rowsNew, again.rowsSkipped], [0, 6]);
  assert.equal(listProfiles(db, user.id).length, 1);
  undoBatch(db, user.id, batch.id);
  assert.equal(sessionView(db, user).lines.length, 0);
  assert.equal(code(() => undoBatch(db, user.id, batch.id)), 'notFound');
});

test('session: match, cash, rules, assign, close', () => {
  const { db, user, bpm, cash, input } = setup();
  const spesa = createBucket(db, user.id, spend('Spesa'));
  const svago = createBucket(db, user.id, spend('Svago'));
  const auto = createBucket(db, user.id, spend('Auto'));

  const benzina = createCapture(db, user.id, { amountCents: 4500, spentAt: '2026-11-16T17:40:00Z', accountId: bpm.id, note: 'Benzina' });
  const pranzo = createCapture(db, user.id, { amountCents: 1250, spentAt: '2026-11-17T12:05:00Z', accountId: bpm.id, note: 'Pranzo da Luigi' });
  const caffe = createCapture(db, user.id, { amountCents: 140, spentAt: '2026-11-17T07:12:00Z', accountId: cash.id, note: 'Caffè' });

  importRows(db, user.id, input);
  let view = prepareSession(db, user);
  // Benzina is sure, Pranzo differs by 0,50 € and is asked; the coffee became a cash line.
  const eni = view.lines.find((l) => l.description === 'Eni Station')!;
  assert.equal(eni.capture?.id, benzina.id);
  assert.equal(eni.capture?.matchedBy, 'auto');
  assert.deepEqual(view.ask.map((a) => a.capture.id), [pranzo.id]);
  const coffee = view.lines.find((l) => l.fromCash)!;
  assert.equal(coffee.amountCents, -140);
  assert.equal(coffee.capture?.note, 'Caffè');
  assert.equal(listQueue(db, user.id).length, 1);

  // "Non è questa" and then the right answer.
  const luigi = view.lines.find((l) => l.description === 'Ristorante Da Luigi')!;
  view = rejectMatch(db, user, pranzo.id, luigi.id);
  assert.equal(view.ask.length, 0);
  assert.equal(view.unmatched[0].id, pranzo.id);
  assert.equal(code(() => confirmMatch(db, user, pranzo.id, eni.id)), 'lineMatched');

  // Assign, remembering Esselunga.
  const esselunga = view.lines.find((l) => l.description === 'Esselunga Milano')!;
  assignLine(db, user, esselunga.id, spesa.id, true);
  assignLine(db, user, luigi.id, svago.id, false);
  assignLine(db, user, eni.id, auto.id, false);
  assignLine(db, user, coffee.id, svago.id, false);
  view = setLineKind(db, user, view.lines.find((l) => l.kind === 'income')!.id, 'income', true, true);
  assert.equal(code(() => closeSession(db, user)), 'none');
  assert.equal(sessionView(db, user).lines.length, 0);
  assert.ok(findUser(db, user.id)?.last_session_at);

  // The buckets of November paid for it; the salary is base income.
  const nov = budgetView(db, user, '2026-11');
  const spent = (id: number) => nov.buckets.find((b) => b.id === id)!.spentCents;
  assert.equal(spent(spesa.id), 5430);
  assert.equal(spent(svago.id), 1440);
  assert.equal(spent(auto.id), 4500);
  assert.equal(nov.incomeCents, 235000);

  // Next month: the rule books Esselunga by itself, flagged as a new rule.
  importRows(db, user.id, { ...input, rows: [{ date: '2026-12-02', valueDate: null, amountCents: -3210, description: 'POS 02/12 ESSELUNGA MILANO 0577', externalId: null }], profile: null });
  view = prepareSession(db, user);
  assert.equal(view.lines[0].bucketId, spesa.id);
  assert.equal(view.lines[0].assignedBy, 'rule');
  assert.equal(view.lines[0].newRule, true);
  assert.equal(view.open, 0);
  assert.equal(listBuckets(db, user.id).length, 4);
});

test('session: cannot close with lines left, nor book in a closed month', () => {
  const { db, user, input } = setup();
  const spesa = createBucket(db, user.id, spend('Spesa'));
  importRows(db, user.id, input);
  const view = prepareSession(db, user);
  assert.equal(view.open, 3);
  assert.equal(code(() => closeSession(db, user)), 'unassigned');
  db.prepare("INSERT INTO periods (user_id, month, status) VALUES (?, '2026-11', 'closed') ON CONFLICT (user_id, month) DO UPDATE SET status = 'closed'").run(user.id);
  assert.equal(code(() => assignLine(db, user, view.lines[3].id, spesa.id, false)), 'periodClosed');
});

test('trends: income and spending by month and bucket', async () => {
  const { trends } = await import('../src/services/trends.ts');
  const { db, user, input } = setup();
  const spesa = createBucket(db, user.id, spend('Spesa'));
  const auto = createBucket(db, user.id, spend('Auto'));
  importRows(db, user.id, input);
  const view = prepareSession(db, user);
  for (const l of view.lines.filter((x) => x.kind === 'expense')) assignLine(db, user, l.id, l.description.startsWith('Eni') ? auto.id : spesa.id, false);
  setLineKind(db, user, view.lines.find((l) => l.kind === 'income')!.id, 'income', true, false);
  const t = trends(db, user.id, '2026-12', 3);
  assert.deepEqual(t.months, [
    { month: '2026-10', incomeCents: 0, spentCents: 0 },
    { month: '2026-11', incomeCents: 235000, spentCents: 11230 },
    { month: '2026-12', incomeCents: 0, spentCents: 0 }
  ]);
  assert.deepEqual(t.buckets[0], { bucket: t.buckets[0].bucket, spentCents: [0, 6730, 0] });
  assert.equal(t.buckets[0].bucket.name, 'Spesa');
});
