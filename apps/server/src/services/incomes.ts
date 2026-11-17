// SPDX-License-Identifier: AGPL-3.0-or-later
// Income typed by hand (salary, refunds) until imports bring it in. Stored as an income transaction.
import { monthRange, type Income } from '@cashket/shared';
import { randomUUID } from 'node:crypto';
import { insertedId, type Sqlite } from '../db/core.ts';
import { notFound } from '../errors.ts';
import { getAccount } from './accounts.ts';

interface IncomeRow {
  id: number;
  account_id: number;
  date: string;
  amount_cents: number;
  description: string;
  budget_base: number;
}

const toIncome = (r: IncomeRow): Income => ({
  id: r.id,
  accountId: r.account_id,
  date: r.date,
  amountCents: r.amount_cents,
  description: r.description,
  budgetBase: !!r.budget_base
});

export function listIncomes(db: Sqlite, userId: number, month: string): Income[] {
  const { from, to } = monthRange(month);
  return (
    db
      .prepare(
        "SELECT * FROM transactions WHERE user_id = ? AND kind = 'income' AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC"
      )
      .all(userId, from, to) as IncomeRow[]
  ).map(toIncome);
}

/** Base income of a month: what fills the percentage buckets (docs/SPEC.md §4.3). */
export function baseIncome(db: Sqlite, userId: number, month: string): number {
  const { from, to } = monthRange(month);
  return (
    db
      .prepare(
        "SELECT COALESCE(SUM(amount_cents), 0) AS n FROM transactions WHERE user_id = ? AND kind = 'income' AND budget_base = 1 AND date BETWEEN ? AND ?"
      )
      .get(userId, from, to) as { n: number }
  ).n;
}

export interface IncomeInput {
  accountId: number;
  date: string;
  amountCents: number;
  description: string;
  budgetBase: boolean;
}

export function addIncome(db: Sqlite, userId: number, input: IncomeInput): Income {
  getAccount(db, userId, input.accountId);
  const id = insertedId(
    db
      .prepare(
        `INSERT INTO transactions (user_id, account_id, date, amount_cents, description_raw, description, fingerprint, kind, budget_base, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'income', ?, 'reviewed')`
      )
      .run(userId, input.accountId, input.date, input.amountCents, input.description, input.description, `manual:${randomUUID()}`, input.budgetBase ? 1 : 0)
  );
  return toIncome(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as IncomeRow);
}

/** Only income typed by hand can be deleted here; imported lines are undone with their batch. */
export function deleteIncome(db: Sqlite, userId: number, id: number) {
  const r = db
    .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ? AND kind = 'income' AND batch_id IS NULL")
    .run(id, userId);
  if (!Number(r.changes)) throw notFound();
}
