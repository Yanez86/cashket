// SPDX-License-Identifier: AGPL-3.0-or-later
// Andamento: base income and spending month by month, overall and per bucket (docs/SPEC.md §11, phase 6).
import { addMonths, monthRange, type Trends } from '@cashket/shared';
import type { Sqlite } from '../db/core.ts';
import { bucketRows, toBucket } from './buckets.ts';

export function trends(db: Sqlite, userId: number, lastMonth: string, count: number): Trends {
  const months = Array.from({ length: count }, (_, i) => addMonths(lastMonth, i - count + 1));
  const spent = db
    .prepare(
      `SELECT p.month, e.bucket_id, -SUM(e.amount_cents) AS cents FROM budget_entries e JOIN periods p ON p.id = e.period_id
       WHERE e.user_id = ? AND e.kind = 'spend' AND p.month BETWEEN ? AND ? GROUP BY p.month, e.bucket_id`
    )
    .all(userId, months[0], lastMonth) as { month: string; bucket_id: number; cents: number }[];
  const income = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month, SUM(amount_cents) AS cents FROM transactions
       WHERE user_id = ? AND kind = 'income' AND budget_base = 1 AND date BETWEEN ? AND ? GROUP BY month`
    )
    .all(userId, monthRange(months[0]).from, monthRange(lastMonth).to) as { month: string; cents: number }[];
  const rows = bucketRows(db, userId);
  return {
    months: months.map((month) => ({
      month,
      incomeCents: income.find((r) => r.month === month)?.cents ?? 0,
      spentCents: spent.filter((r) => r.month === month).reduce((t, r) => t + r.cents, 0)
    })),
    buckets: rows
      .map((r) => ({ bucket: toBucket(r, true), spentCents: months.map((m) => spent.find((s) => s.month === m && s.bucket_id === r.id)?.cents ?? 0) }))
      // Archived buckets only while they had spending in the window.
      .filter((b) => !b.bucket.archived || b.spentCents.some((c) => c !== 0))
      .sort((a, b) => b.spentCents.reduce((t, c) => t + c, 0) - a.spentCents.reduce((t, c) => t + c, 0))
  };
}
