// SPDX-License-Identifier: AGPL-3.0-or-later
// Periods and the bucket ledger (docs/SPEC.md §4). A bucket's balance in a month is the sum of its
// entries in that month: rollover from the previous month, allocation, moves and spending.
import { addMonths, bucketStatus, planClose, planFill, type BudgetView } from '@cashket/shared';
import { randomUUID } from 'node:crypto';
import { insertedId, type Sqlite } from '../db/core.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { bucketRows, fillOf, leftoverOf, overspendOf, toBucket } from './buckets.ts';
import { baseIncome } from './incomes.ts';
import type { UserRow } from './users.ts';

interface PeriodRow {
  id: number;
  user_id: number;
  month: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  allocated_at: string | null;
  allocated_income_cents: number | null;
}

const findPeriod = (db: Sqlite, userId: number, month: string) =>
  db.prepare('SELECT * FROM periods WHERE user_id = ? AND month = ?').get(userId, month) as PeriodRow | undefined;

export function ensurePeriod(db: Sqlite, userId: number, month: string): PeriodRow {
  const found = findPeriod(db, userId, month);
  if (found) return found;
  const id = insertedId(db.prepare('INSERT INTO periods (user_id, month) VALUES (?, ?)').run(userId, month));
  return db.prepare('SELECT * FROM periods WHERE id = ?').get(id) as PeriodRow;
}

function openPeriod(db: Sqlite, userId: number, month: string): PeriodRow {
  const period = ensurePeriod(db, userId, month);
  if (period.status === 'closed') throw conflict('periodClosed');
  return period;
}

const incomeMonth = (user: UserRow, month: string) => (user.percent_base === 'previous' ? addMonths(month, -1) : month);

/** Sums per bucket and kind for one period. */
function entrySums(db: Sqlite, periodId: number | undefined) {
  const sums = new Map<number, { allocation: number; spend: number; move: number; rollover: number }>();
  if (periodId === undefined) return sums;
  const rows = db
    .prepare('SELECT bucket_id, kind, SUM(amount_cents) AS total FROM budget_entries WHERE period_id = ? GROUP BY bucket_id, kind')
    .all(periodId) as { bucket_id: number; kind: 'allocation' | 'spend' | 'move' | 'rollover'; total: number }[];
  for (const r of rows) {
    const s = sums.get(r.bucket_id) ?? { allocation: 0, spend: 0, move: 0, rollover: 0 };
    s[r.kind] += r.total;
    sums.set(r.bucket_id, s);
  }
  return sums;
}

const balanceOf = (s?: { allocation: number; spend: number; move: number; rollover: number }) =>
  s ? s.allocation + s.spend + s.move + s.rollover : 0;

export function budgetView(db: Sqlite, user: UserRow, month: string): BudgetView {
  const period = findPeriod(db, user.id, month);
  const sums = entrySums(db, period?.id);
  const rows = bucketRows(db, user.id);
  const active = rows.filter((r) => !r.archived);
  const incomeFrom = incomeMonth(user, month);
  const incomeCents = baseIncome(db, user.id, incomeFrom);
  const plan = planFill(active.map((r) => ({ id: r.id, fill: fillOf(r) })), incomeCents);
  const allocated = !!period?.allocated_at;
  const allocatedTotal = [...sums.values()].reduce((t, s) => t + s.allocation, 0);
  // Archived buckets still show while they hold money in this month.
  const shown = rows.filter((r) => !r.archived || balanceOf(sums.get(r.id)) !== 0);
  return {
    month,
    status: period?.status ?? 'open',
    incomeMonth: incomeFrom,
    incomeCents,
    allocated,
    plan: plan.allocations,
    unassignedCents: allocated ? incomeCents - allocatedTotal : plan.unassignedCents,
    buckets: shown.map((r) => {
      const s = sums.get(r.id);
      const balanceCents = balanceOf(s);
      return {
        ...toBucket(r),
        balanceCents,
        allocatedCents: s?.allocation ?? 0,
        spentCents: -(s?.spend ?? 0),
        rolloverCents: s?.rollover ?? 0,
        status: bucketStatus(r.kind, balanceCents)
      };
    })
  };
}

/** Fills the buckets from the month's base income. Running it again replaces the previous allocation. */
export function allocate(db: Sqlite, user: UserRow, month: string): BudgetView {
  db.transaction(() => {
    const period = openPeriod(db, user.id, month);
    const active = bucketRows(db, user.id, false);
    const income = baseIncome(db, user.id, incomeMonth(user, month));
    const plan = planFill(active.map((r) => ({ id: r.id, fill: fillOf(r) })), income);
    db.prepare("DELETE FROM budget_entries WHERE period_id = ? AND kind = 'allocation'").run(period.id);
    const insert = db.prepare(
      "INSERT INTO budget_entries (user_id, bucket_id, period_id, amount_cents, kind, origin) VALUES (?, ?, ?, ?, 'allocation', 'system')"
    );
    for (const a of plan.allocations) if (a.cents) insert.run(user.id, a.bucketId, period.id, a.cents);
    db.prepare('UPDATE periods SET allocated_at = ?, allocated_income_cents = ? WHERE id = ?').run(new Date().toISOString(), income, period.id);
  });
  return budgetView(db, user, month);
}

/** Moves money between two buckets inside a month. */
export function moveBetween(db: Sqlite, user: UserRow, month: string, fromId: number, toId: number, cents: number, note: string | null) {
  if (fromId === toId || cents <= 0) throw badRequest('move');
  db.transaction(() => {
    const period = openPeriod(db, user.id, month);
    for (const id of [fromId, toId]) {
      if (!db.prepare('SELECT id FROM buckets WHERE id = ? AND user_id = ?').get(id, user.id)) throw notFound();
    }
    const group = randomUUID();
    const insert = db.prepare(
      "INSERT INTO budget_entries (user_id, bucket_id, period_id, amount_cents, kind, group_id, origin, note) VALUES (?, ?, ?, ?, 'move', ?, 'user', ?)"
    );
    insert.run(user.id, fromId, period.id, -cents, group, note);
    insert.run(user.id, toId, period.id, cents, group, note);
  });
  return budgetView(db, user, month);
}

const closeGroup = (month: string) => `close:${month}`;

/**
 * Closes a month: what is left or overspent in each bucket goes to the next month as rollover entries,
 * following each bucket's policies. The next month must still be open.
 */
export function closePeriod(db: Sqlite, user: UserRow, month: string): BudgetView {
  db.transaction(() => {
    const period = openPeriod(db, user.id, month);
    const next = openPeriod(db, user.id, addMonths(month, 1));
    const sums = entrySums(db, period.id);
    const rows = bucketRows(db, user.id);
    const rollovers = planClose(
      rows.map((r) => ({ id: r.id, balanceCents: balanceOf(sums.get(r.id)), leftover: leftoverOf(r), overspend: overspendOf(r) }))
    );
    const insert = db.prepare(
      "INSERT INTO budget_entries (user_id, bucket_id, period_id, amount_cents, kind, group_id, origin, note) VALUES (?, ?, ?, ?, 'rollover', ?, 'system', ?)"
    );
    for (const r of rollovers) insert.run(user.id, r.bucketId, next.id, r.cents, closeGroup(month), r.fromBucketId === r.bucketId ? null : `from:${r.fromBucketId}`);
    db.prepare("UPDATE periods SET status = 'closed', closed_at = ? WHERE id = ?").run(new Date().toISOString(), period.id);
  });
  return budgetView(db, user, month);
}

/** Reopens a closed month and takes back its rollovers, as long as the next month is still open. */
export function reopenPeriod(db: Sqlite, user: UserRow, month: string): BudgetView {
  db.transaction(() => {
    const period = findPeriod(db, user.id, month);
    if (!period || period.status !== 'closed') throw conflict('periodOpen');
    const next = findPeriod(db, user.id, addMonths(month, 1));
    if (next?.status === 'closed') throw conflict('nextClosed');
    db.prepare('DELETE FROM budget_entries WHERE user_id = ? AND group_id = ?').run(user.id, closeGroup(month));
    db.prepare("UPDATE periods SET status = 'open', closed_at = NULL WHERE id = ?").run(period.id);
  });
  return budgetView(db, user, month);
}
