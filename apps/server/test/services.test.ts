// SPDX-License-Identifier: AGPL-3.0-or-later
// The services on an in-memory database (Node's built-in SQLite): SQL and budget rules, without HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BucketInput } from '@cashket/shared';
import { memoryDb } from './sqlite.ts';
import { createUser, findUser, updateProfile } from '../src/services/users.ts';
import { createAccount, listAccounts, updateAccount } from '../src/services/accounts.ts';
import { createBucket, listBuckets, setArchived, updateBucket } from '../src/services/buckets.ts';
import { addIncome, deleteIncome, listIncomes } from '../src/services/incomes.ts';
import { allocate, budgetView, closePeriod, moveBetween, reopenPeriod } from '../src/services/budget.ts';
import { HttpError } from '../src/errors.ts';

function person(name = 'Anna') {
  const db = memoryDb();
  const user = createUser(db, { name, email: `${name}@casa.it`, passwordHash: 'x', role: 'admin' });
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

test('a new person has a cash account and a remainder bucket', () => {
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
  const bBucket = listBuckets(db, b.id)[0];
  assert.equal(code(() => setArchived(db, a.id, bBucket.id, true)), 'notFound');
  assert.equal(listBuckets(db, a.id).length, 1);
});
