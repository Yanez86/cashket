// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, bucketStatus, isMonth, monthOf, monthRange, planClose, planFill } from './budget.ts';

test('months', () => {
  assert.equal(addMonths('2026-11', 1), '2026-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(monthOf('2026-11-17'), '2026-11');
  assert.equal(monthOf(new Date('2026-11-30T23:30:00Z'), 'Europe/Rome'), '2026-12');
  assert.ok(isMonth('2026-11'));
  assert.ok(!isMonth('2026-13'));
});

test('fill: fixed, then percent, then remainder', () => {
  const plan = planFill(
    [
      { id: 1, fill: { type: 'remainder' } },
      { id: 2, fill: { type: 'percent', percent: 10 } },
      { id: 3, fill: { type: 'fixed', amountCents: 45000 } }
    ],
    235000
  );
  assert.deepEqual(plan.allocations, [
    { bucketId: 3, cents: 45000 },
    { bucketId: 2, cents: 23500 },
    { bucketId: 1, cents: 166500 }
  ]);
  assert.equal(plan.unassignedCents, 0);
});

test('fill: a shortfall is shown, not cut', () => {
  const plan = planFill(
    [
      { id: 1, fill: { type: 'fixed', amountCents: 100000 } },
      { id: 2, fill: { type: 'remainder' } }
    ],
    80000
  );
  assert.deepEqual(plan.allocations, [
    { bucketId: 1, cents: 100000 },
    { bucketId: 2, cents: 0 }
  ]);
  assert.equal(plan.unassignedCents, -20000);
});

test('fill: without a remainder bucket the rest stays unassigned', () => {
  const plan = planFill([{ id: 1, fill: { type: 'fixed', amountCents: 1000 } }], 5000);
  assert.equal(plan.unassignedCents, 4000);
});

test('close: carry, move, reset and overspend', () => {
  const rollovers = planClose([
    { id: 1, balanceCents: 1000, leftover: { type: 'carry' }, overspend: { type: 'carry' } },
    { id: 2, balanceCents: 1000, leftover: { type: 'move', toBucketId: 9, percent: 50 }, overspend: { type: 'carry' } },
    { id: 3, balanceCents: 1000, leftover: { type: 'reset' }, overspend: { type: 'carry' } },
    { id: 4, balanceCents: -300, leftover: { type: 'carry' }, overspend: { type: 'carry' } },
    { id: 5, balanceCents: -200, leftover: { type: 'carry' }, overspend: { type: 'cover', fromBucketId: 9 } },
    { id: 9, balanceCents: 0, leftover: { type: 'carry' }, overspend: { type: 'carry' } }
  ]);
  assert.deepEqual(rollovers, [
    { bucketId: 1, cents: 1000, fromBucketId: 1 },
    { bucketId: 9, cents: 500, fromBucketId: 2 },
    { bucketId: 4, cents: -300, fromBucketId: 4 },
    { bucketId: 9, cents: -200, fromBucketId: 5 }
  ]);
});

test('status', () => {
  assert.equal(bucketStatus('spend', 10), 'ok');
  assert.equal(bucketStatus('saving', 10), 'saving');
  assert.equal(bucketStatus('spend', -1), 'over');
});
