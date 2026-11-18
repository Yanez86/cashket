// SPDX-License-Identifier: AGPL-3.0-or-later
// The services on an in-memory database (Node's built-in SQLite): SQL and budget rules, without HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BucketInput } from '@cashket/shared';
import { memoryDb, seed } from './sqlite.ts';
import { createUser, findUser, updateProfile } from '../src/services/users.ts';
import { createAccount, listAccounts, updateAccount } from '../src/services/accounts.ts';
import { createBucket, listBuckets, setArchived, updateBucket } from '../src/services/buckets.ts';
import { addIncome, deleteIncome, listIncomes } from '../src/services/incomes.ts';
import { allocate, budgetView, closePeriod, moveBetween, reopenPeriod } from '../src/services/budget.ts';
import { HttpError } from '../src/errors.ts';

function person(name = 'Anna') {
  const db = memoryDb();
  const user = createUser(db, { name, email: `${name}@casa.it`, passwordHash: 'x', role: 'admin' });
  seed(db, user.id);
  return { db, user: updateProfile(db, user.id, { percentBase: 'current' }) };
}

const spend = (name: string, fill: BucketInput['fill'], extra: Partial<BucketInput> = {}): BucketInput => ({
  name,
  icon: { kind: 'category', key: 'groceries' },
  kind: 'spend',
  fill,
  goalCents: null,
  leftover: { type: 'carry' },
  overspend: { type: 'carry' },
  ...extra
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as HttpError).code;
  }
  return 'none';
};

test('a seeded person has a cash account and a remainder bucket', () => {
  const { db, user } = person();
  assert.deepEqual(listAccounts(db, user.id).map((a) => [a.name, a.kind]), [['Contanti', 'cash']]);
  const [risparmio] = listBuckets(db, user.id);
  assert.equal(risparmio.name, 'Risparmio');
  assert.deepEqual(risparmio.fill, { type: 'remainder' });
  assert.equal(findUser(db, user.id)?.percent_base, 'current');
});

test('accounts: a card settles to a non-card account', () => {
  const { db, user } = person();
  const bpm = createAccount(db, user.id, { name: 'Conto BPM', kind: 'checking', settlesToAccountId: null });
  const nexi = createAccount(db, user.id, { name: 'Nexi', kind: 'card', settlesToAccountId: bpm.id });
  assert.equal(nexi.settlesToAccountId, bpm.id);
  assert.equal(code(() => createAccount(db, user.id, { name: 'X', kind: 'card', settlesToAccountId: nexi.id })), 'settlement');
  assert.equal(code(() => createAccount(db, user.id, { name: 'X', kind: 'checking', settlesToAccountId: bpm.id })), 'settlement');
  assert.equal(updateAccount(db, user.id, nexi.id, { archived: true }).archived, true);
});

test('buckets: one remainder, custom icons, round trip of rules', () => {
  const { db, user } = person();
  assert.equal(code(() => createBucket(db, user.id, spend('Altro resto', { type: 'remainder' }))), 'remainderTaken');
  const [risparmio] = listBuckets(db, user.id);
  const svago = createBucket(
    db,
    user.id,
    spend('Svago', { type: 'percent', percent: 12.5 }, {
      icon: { kind: 'custom', letter: 'hobby', color: '#E8603C' },
      leftover: { type: 'move', toBucketId: risparmio.id, percent: 50 },
      overspend: { type: 'cover', fromBucketId: risparmio.id }
    })
  );
  assert.deepEqual(svago.icon, { kind: 'custom', letter: 'H', color: '#E8603C' });
  assert.deepEqual(svago.fill, { type: 'percent', percent: 12.5 });
  assert.deepEqual(svago.leftover, { type: 'move', toBucketId: risparmio.id, percent: 50 });
  assert.equal(code(() => updateBucket(db, user.id, svago.id, spend('Svago', { type: 'fixed', amountCents: 1 }, { leftover: { type: 'move', toBucketId: svago.id, percent: 100 } }))), 'sameBucket');
  // Archiving the target sends the other bucket's policies back to carrying.
  setArchived(db, user.id, risparmio.id, true);
  const after = listBuckets(db, user.id).find((b) => b.id === svago.id)!;
  assert.deepEqual(after.leftover, { type: 'carry' });
  assert.deepEqual(after.overspend, { type: 'carry' });
});

test('budget: fill, move, close, reopen', () => {
  const { db, user } = person();
  const conto = createAccount(db, user.id, { name: 'Conto', kind: 'checking', settlesToAccountId: null });
  const spesa = createBucket(db, user.id, spend('Spesa', { type: 'fixed', amountCents: 45000 }));
  const svago = createBucket(db, user.id, spend('Svago', { type: 'percent', percent: 10 }, { leftover: { type: 'reset' } }));
  const risparmio = listBuckets(db, user.id).find((b) => b.name === 'Risparmio')!;

  addIncome(db, user.id, { accountId: conto.id, date: '2026-11-27', amountCents: 235000, description: 'Stipendio', budgetBase: true });
  const rimborso = addIncome(db, user.id, { accountId: conto.id, date: '2026-11-10', amountCents: 5000, description: 'Rimborso', budgetBase: false });
  assert.equal(listIncomes(db, user.id, '2026-11').length, 2);

  let view = budgetView(db, user, '2026-11');
  assert.equal(view.incomeCents, 235000);
  assert.equal(view.allocated, false);

  view = allocate(db, user, '2026-11');
  const bal = (id: number) => view.buckets.find((b) => b.id === id)!.balanceCents;
  assert.equal(view.allocated, true);
  assert.equal(bal(spesa.id), 45000);
  assert.equal(bal(svago.id), 23500);
  assert.equal(bal(risparmio.id), 166500);
  assert.equal(view.unassignedCents, 0);
  // Allocating again replaces, it does not add.
  view = allocate(db, user, '2026-11');
  assert.equal(bal(spesa.id), 45000);

  view = moveBetween(db, user, '2026-11', spesa.id, svago.id, 5000, null);
  assert.equal(bal(spesa.id), 40000);
  assert.equal(bal(svago.id), 28500);

  view = closePeriod(db, user, '2026-11');
  assert.equal(view.status, 'closed');
  assert.equal(code(() => allocate(db, user, '2026-11')), 'periodClosed');
  const dec = budgetView(db, user, '2026-12');
  const decBal = (id: number) => dec.buckets.find((b) => b.id === id)!.rolloverCents;
  assert.equal(decBal(spesa.id), 40000); // carry
  assert.equal(decBal(svago.id), 0); // reset
  assert.equal(decBal(risparmio.id), 166500);

  reopenPeriod(db, user, '2026-11');
  assert.equal(budgetView(db, user, '2026-12').buckets.find((b) => b.id === spesa.id)!.rolloverCents, 0);

  deleteIncome(db, user.id, rimborso.id);
  assert.equal(listIncomes(db, user.id, '2026-11').length, 1);
});

test('budget: previous month income by default', () => {
  const db = memoryDb();
  const user = createUser(db, { name: 'Bea', email: 'bea@casa.it', passwordHash: 'x', role: 'member' });
  seed(db, user.id);
  const [cash] = listAccounts(db, user.id);
  addIncome(db, user.id, { accountId: cash.id, date: '2026-10-27', amountCents: 100000, description: 'Stipendio', budgetBase: true });
  const view = budgetView(db, user, '2026-11');
  assert.equal(view.incomeMonth, '2026-10');
  assert.equal(view.incomeCents, 100000);
});

test('people do not see each other', () => {
  const db = memoryDb();
  const a = createUser(db, { name: 'A', email: 'a@casa.it', passwordHash: 'x', role: 'admin' });
  const b = createUser(db, { name: 'B', email: 'b@casa.it', passwordHash: 'x', role: 'member' });
  seed(db, a.id);
  seed(db, b.id);
  const bBucket = listBuckets(db, b.id)[0];
  assert.equal(code(() => setArchived(db, a.id, bBucket.id, true)), 'notFound');
  assert.equal(listBuckets(db, a.id).length, 1);
});

test('captures: queue, idempotent client id, edit, delete, summary in the month', async () => {
  const { createCapture, deleteCapture, listQueue, queueSummary, updateCapture } = await import('../src/services/captures.ts');
  const { db, user } = person();
  const [cash] = listAccounts(db, user.id);
  const caffe = createCapture(db, user.id, { amountCents: 140, spentAt: '2026-11-17T07:12:00Z', accountId: cash.id, note: 'Caffè', clientId: 'c1' });
  assert.equal(caffe.amountCents, 140);
  assert.equal(createCapture(db, user.id, { amountCents: 140, spentAt: '2026-11-17T07:12:00Z', accountId: cash.id, note: 'Caffè', clientId: 'c1' }).id, caffe.id);
  const pranzo = createCapture(db, user.id, { amountCents: 1250, spentAt: '2026-11-17T12:05:00Z', accountId: null, note: null });
  assert.deepEqual(listQueue(db, user.id).map((c) => c.id), [pranzo.id, caffe.id]);
  assert.deepEqual(queueSummary(db, user.id), { count: 2, totalCents: 1390 });
  assert.equal(updateCapture(db, user.id, pranzo.id, { amountCents: 1300, note: 'Pranzo' }).note, 'Pranzo');
  assert.equal(budgetView(db, user, '2026-11').queue.totalCents, 1440);
  deleteCapture(db, user.id, caffe.id);
  assert.equal(queueSummary(db, user.id).count, 1);
  // Someone else's account cannot be used.
  const other = createUser(db, { name: 'B', email: 'b2@casa.it', passwordHash: 'x', role: 'member' });
  assert.equal(code(() => createCapture(db, other.id, { amountCents: 1, spentAt: '2026-11-17T07:00:00Z', accountId: cash.id, note: null })), 'notFound');
  db.prepare("UPDATE captures SET status = 'matched' WHERE id = ?").run(pranzo.id);
  assert.equal(code(() => deleteCapture(db, user.id, pranzo.id)), 'captureDone');
});

test('reminders: on, something to do, old session, right hour, once a day', async () => {
  const { dueReminders, markReminded, reminderText } = await import('../src/services/reminders.ts');
  const { createCapture } = await import('../src/services/captures.ts');
  const { db, user } = person();
  const evening = new Date('2026-11-17T18:30:00Z'); // 19:30 in Rome
  createCapture(db, user.id, { amountCents: 140, spentAt: '2026-11-17T07:00:00Z', accountId: null, note: null });
  assert.equal(dueReminders(db, evening).length, 0); // reminder off
  updateProfile(db, user.id, { sessionReminderDays: 7, reminderHour: 19 });
  assert.equal(dueReminders(db, new Date('2026-11-17T16:00:00Z')).length, 0); // 17:00, too early
  const [due] = dueReminders(db, evening);
  assert.equal(due.localDay, '2026-11-17');
  assert.equal(reminderText(due), '1 spesa in coda · nessuna sessione ancora');
  markReminded(db, user.id, due.localDay);
  assert.equal(dueReminders(db, evening).length, 0); // once a day
  db.prepare('UPDATE users SET last_session_at = ?, last_reminded_on = NULL WHERE id = ?').run('2026-11-14T10:00:00Z', user.id);
  assert.equal(dueReminders(db, evening).length, 0); // session 3 days ago
  assert.equal(dueReminders(db, new Date('2026-11-22T18:30:00Z')).length, 1);
});

test('onboarding: skip, complete, recommended, delete, reset', async () => {
  const { addRecommended, completeOnboarding, resetAccount, skipOnboarding } = await import('../src/services/onboarding.ts');
  const { deleteAccount } = await import('../src/services/accounts.ts');
  const { deleteBucket } = await import('../src/services/buckets.ts');
  const { STARTER_BUCKETS, monthOf } = await import('@cashket/shared');
  const db = memoryDb();
  const anna = createUser(db, { name: 'Anna', email: 'anna@casa.it', passwordHash: 'x', role: 'admin' });
  assert.equal(findUser(db, anna.id)?.onboarded_at, null);
  assert.equal(listAccounts(db, anna.id).length, 0);

  // Skip: cash and every recommended bucket.
  const skipped = skipOnboarding(db, anna);
  assert.ok(skipped.onboarded_at);
  assert.deepEqual(listAccounts(db, anna.id).map((a) => a.kind), ['cash']);
  assert.equal(listBuckets(db, anna.id).length, STARTER_BUCKETS.length);
  assert.equal(addRecommended(db, anna.id), 0);

  // Complete: accounts with a card charged to the checking account, chosen buckets, income, month filled.
  const bea = createUser(db, { name: 'Bea', email: 'bea@casa.it', passwordHash: 'x', role: 'member' });
  completeOnboarding(db, bea, {
    percentBase: 'current',
    monthlyIncomeCents: 200000,
    accounts: [
      { name: 'Banco BPM', kind: 'checking', settlesTo: null },
      { name: 'Nexi', kind: 'card', settlesTo: 0 },
      { name: 'Contanti', kind: 'cash', settlesTo: null }
    ],
    buckets: [
      { name: 'Spesa', category: 'groceries', kind: 'spend', percent: 20, goalCents: null },
      { name: 'Risparmio', category: 'savings', kind: 'saving', percent: null, goalCents: null }
    ],
    sessionReminderDays: 7
  });
  const accounts = listAccounts(db, bea.id);
  assert.equal(accounts[1].settlesToAccountId, accounts[0].id);
  const month = monthOf(new Date(), 'Europe/Rome');
  const view = budgetView(db, findUser(db, bea.id)!, month);
  assert.deepEqual(view.buckets.map((b) => b.balanceCents), [40000, 160000]);
  assert.equal(findUser(db, bea.id)?.session_reminder_days, 7);
  assert.equal(addRecommended(db, bea.id), STARTER_BUCKETS.length - 2);

  // Delete only what has no history.
  assert.equal(code(() => deleteAccount(db, bea.id, accounts[0].id)), 'accountUsed');
  deleteAccount(db, bea.id, accounts[1].id);
  const spesa = listBuckets(db, bea.id).find((b) => b.name === 'Spesa')!;
  assert.equal(spesa.hasHistory, true);
  assert.equal(code(() => deleteBucket(db, bea.id, spesa.id)), 'bucketUsed');
  const casa = listBuckets(db, bea.id).find((b) => b.name === 'Casa')!;
  deleteBucket(db, bea.id, casa.id);

  // Reset: empty again, tutorial again; Anna untouched.
  resetAccount(db, bea.id);
  assert.equal(listAccounts(db, bea.id).length, 0);
  assert.equal(listBuckets(db, bea.id).length, 0);
  assert.equal(findUser(db, bea.id)?.onboarded_at, null);
  assert.equal(listBuckets(db, anna.id).length, STARTER_BUCKETS.length);
});
