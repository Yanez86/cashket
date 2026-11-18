// SPDX-License-Identifier: AGPL-3.0-or-later
// The welcome tutorial, the recommended buckets and resetting an account (improvements 9, 11, 12).
import { STARTER_BUCKETS, addMonths, monthOf, monthRange, type AccountKind, type BucketKind, type CategoryKey } from '@cashket/shared';
import type { Sqlite } from '../db/core.ts';
import { badRequest } from '../errors.ts';
import { createAccount } from './accounts.ts';
import { allocate } from './budget.ts';
import { createBucket } from './buckets.ts';
import { addIncome } from './incomes.ts';
import { findUser, updateProfile, type UserRow } from './users.ts';

export interface OnboardingInput {
  percentBase: 'current' | 'previous';
  /** About how much comes in each month; becomes this month's base income so the buckets fill right away. */
  monthlyIncomeCents: number | null;
  /** settlesTo: index in this list of the account a card is charged to. */
  accounts: { name: string; kind: AccountKind; settlesTo: number | null }[];
  buckets: { name: string; category: CategoryKey; kind: BucketKind; percent: number | null; goalCents: number | null }[];
  sessionReminderDays: number | null;
}

const done = (db: Sqlite, userId: number) => db.prepare('UPDATE users SET onboarded_at = ? WHERE id = ?').run(new Date().toISOString(), userId);

function createBuckets(db: Sqlite, userId: number, buckets: OnboardingInput['buckets']) {
  if (buckets.filter((b) => b.percent == null).length > 1) throw badRequest('remainderTaken');
  for (const b of buckets) {
    createBucket(db, userId, {
      name: b.name,
      icon: { kind: 'category', key: b.category },
      kind: b.kind,
      fill: b.percent == null ? { type: 'remainder' } : { type: 'percent', percent: b.percent },
      goalCents: b.kind === 'saving' ? b.goalCents : null,
      leftover: { type: 'carry' },
      overspend: { type: 'carry' }
    });
  }
}

/** "Salta": the cash account and every recommended bucket. */
export function skipOnboarding(db: Sqlite, user: UserRow): UserRow {
  db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM accounts WHERE user_id = ? AND kind = 'cash' AND archived = 0").get(user.id)) {
      createAccount(db, user.id, { name: 'Contanti', kind: 'cash', settlesToAccountId: null });
    }
    addRecommended(db, user.id);
    done(db, user.id);
  });
  return findUser(db, user.id)!;
}

export function completeOnboarding(db: Sqlite, user: UserRow, input: OnboardingInput): UserRow {
  db.transaction(() => {
    const ids: number[] = [];
    input.accounts.forEach((a) => {
      const settles = a.kind === 'card' && a.settlesTo != null ? ids[a.settlesTo] ?? null : null;
      ids.push(createAccount(db, user.id, { name: a.name, kind: a.kind, settlesToAccountId: settles }).id);
    });
    createBuckets(db, user.id, input.buckets);
    const updated = updateProfile(db, user.id, { percentBase: input.percentBase, sessionReminderDays: input.sessionReminderDays });
    if (input.monthlyIncomeCents) {
      const month = monthOf(new Date(), updated.timezone);
      const incomeMonth = input.percentBase === 'previous' ? addMonths(month, -1) : month;
      const target = input.accounts.findIndex((a) => a.kind === 'checking');
      const accountId = ids[target >= 0 ? target : input.accounts.findIndex((a) => a.kind !== 'card')];
      if (accountId != null) {
        addIncome(db, user.id, {
          accountId,
          date: incomeMonth === month ? new Date().toISOString().slice(0, 10) : monthRange(incomeMonth).to,
          amountCents: input.monthlyIncomeCents,
          description: 'Stipendio (dal tutorial)',
          budgetBase: true
        });
        allocate(db, updated, month);
      }
    }
    done(db, user.id);
  });
  return findUser(db, user.id)!;
}

/** Adds the recommended buckets one does not have yet (by name), and "Risparmio" only without a remainder bucket. */
export function addRecommended(db: Sqlite, userId: number): number {
  const names = new Set(
    (db.prepare('SELECT name FROM buckets WHERE user_id = ? AND archived = 0').all(userId) as { name: string }[]).map((r) => r.name.trim().toLowerCase())
  );
  const hasRemainder = !!db.prepare("SELECT 1 FROM buckets WHERE user_id = ? AND fill_type = 'remainder' AND archived = 0").get(userId);
  const missing = STARTER_BUCKETS.filter((b) => !names.has(b.name.toLowerCase()) && !(b.percent == null && hasRemainder));
  createBuckets(
    db,
    userId,
    missing.map((b) => ({ ...b, goalCents: null }))
  );
  return missing.length;
}

/**
 * Empties an account: money, buckets, accounts, rules, imports and bank links go; the person, their
 * password, settings and Enable Banking application stay. The tutorial shows again.
 */
export function resetAccount(db: Sqlite, userId: number) {
  db.transaction(() => {
    for (const table of ['budget_entries', 'transfer_links', 'transactions', 'captures', 'import_batches', 'import_profiles', 'bank_connections', 'rules', 'periods']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
    db.prepare('UPDATE buckets SET leftover_to_bucket_id = NULL, overspend_from_bucket_id = NULL WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM buckets WHERE user_id = ?').run(userId);
    db.prepare('UPDATE accounts SET settles_to_account_id = NULL WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId);
    db.prepare('UPDATE users SET onboarded_at = NULL, last_session_at = NULL, last_reminded_on = NULL WHERE id = ?').run(userId);
  });
}
