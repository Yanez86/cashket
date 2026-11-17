// SPDX-License-Identifier: AGPL-3.0-or-later
// "Description contains X → bucket Y" (docs/SPEC.md §5.3). Patterns are the cleaned name in lower case.
import { rulePattern } from '@cashket/shared';
import type { Sqlite } from '../db/core.ts';

export interface RuleRow {
  id: number;
  pattern: string;
  account_id: number | null;
  bucket_id: number | null;
  set_kind: 'expense' | 'income' | 'transfer' | null;
  set_budget_base: number | null;
  times_used: number;
}

/** The most specific rule (longest pattern) whose pattern the description contains. */
export function findRule(db: Sqlite, userId: number, accountId: number, description: string): RuleRow | undefined {
  const cleaned = rulePattern(description);
  const raw = description.toLowerCase();
  const rules = db
    .prepare(
      `SELECT r.* FROM rules r LEFT JOIN buckets b ON b.id = r.bucket_id
       WHERE r.user_id = ? AND (r.account_id IS NULL OR r.account_id = ?) AND (r.bucket_id IS NULL OR b.archived = 0)`
    )
    .all(userId, accountId) as RuleRow[];
  return rules
    .filter((r) => r.pattern && (cleaned.includes(r.pattern) || raw.includes(r.pattern)))
    .sort((a, b) => b.pattern.length - a.pattern.length || b.times_used - a.times_used)[0];
}

/** Remembers a bucket for descriptions like this one; an existing rule for the same pattern is updated. */
export function rememberBucket(db: Sqlite, userId: number, description: string, bucketId: number) {
  const pattern = rulePattern(description);
  if (pattern.length < 3) return;
  const found = db.prepare('SELECT id FROM rules WHERE user_id = ? AND pattern = ? AND account_id IS NULL').get(userId, pattern) as { id: number } | undefined;
  if (found) db.prepare('UPDATE rules SET bucket_id = ? WHERE id = ?').run(bucketId, found.id);
  else db.prepare('INSERT INTO rules (user_id, pattern, bucket_id, times_used) VALUES (?, ?, ?, 1)').run(userId, pattern, bucketId);
}

/** Remembers what kind of line descriptions like this one are (a transfer, base income). */
export function rememberKind(db: Sqlite, userId: number, description: string, kind: 'expense' | 'income' | 'transfer', budgetBase: boolean) {
  const pattern = rulePattern(description);
  if (pattern.length < 3) return;
  const found = db.prepare('SELECT id FROM rules WHERE user_id = ? AND pattern = ? AND account_id IS NULL').get(userId, pattern) as { id: number } | undefined;
  if (found) db.prepare('UPDATE rules SET set_kind = ?, set_budget_base = ? WHERE id = ?').run(kind, budgetBase ? 1 : 0, found.id);
  else db.prepare('INSERT INTO rules (user_id, pattern, set_kind, set_budget_base) VALUES (?, ?, ?, ?)').run(userId, pattern, kind, budgetBase ? 1 : 0);
}
