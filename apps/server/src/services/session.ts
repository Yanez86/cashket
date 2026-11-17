// SPDX-License-Identifier: AGPL-3.0-or-later
// The reconciliation session (docs/SPEC.md §5.3): queued expenses meet bank lines, lines get a bucket,
// the person checks what the app decided and closes. Every line not yet reviewed is part of the session.
import { monthOf, pairUp, type SessionLine, type SessionView } from '@cashket/shared';
import type { Sqlite } from '../db/core.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { listQueue } from './captures.ts';
import { ensurePeriod } from './budget.ts';
import { listBatches } from './imports.ts';
import { findRule, rememberBucket, rememberKind } from './rules.ts';
import type { UserRow } from './users.ts';

interface LineRow {
  id: number;
  account_id: number;
  date: string;
  amount_cents: number;
  description: string;
  description_raw: string;
  kind: SessionLine['kind'];
  budget_base: number;
  capture_id: number | null;
  bucket_id: number | null;
  entry_origin: 'user' | 'rule' | 'system' | null;
  rule_uses: number | null;
  match_capture_id: number | null;
  match_origin: 'auto' | 'user' | null;
  match_score: number | null;
  capture_note: string | null;
  capture_amount: number | null;
  transfer_kind: SessionLine['transferKind'];
}

const PENDING_LINES = `
  SELECT t.id, t.account_id, t.date, t.amount_cents, t.description, t.description_raw, t.kind, t.budget_base, t.capture_id,
         e.bucket_id, e.origin AS entry_origin, r.times_used AS rule_uses,
         m.capture_id AS match_capture_id, m.origin AS match_origin, m.score AS match_score,
         c.note AS capture_note, c.amount_cents AS capture_amount,
         (SELECT kind FROM transfer_links l WHERE l.from_transaction_id = t.id LIMIT 1) AS transfer_kind
  FROM transactions t
  LEFT JOIN budget_entries e ON e.transaction_id = t.id AND e.kind = 'spend'
  LEFT JOIN rules r ON r.id = e.rule_id
  LEFT JOIN matches m ON m.transaction_id = t.id
  LEFT JOIN captures c ON c.id = COALESCE(m.capture_id, t.capture_id)
  WHERE t.user_id = ? AND t.status = 'pending'
  ORDER BY t.date DESC, t.id DESC`;

const pendingRows = (db: Sqlite, userId: number) => db.prepare(PENDING_LINES).all(userId) as LineRow[];

function ownLine(db: Sqlite, userId: number, id: number) {
  const row = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ? AND status = 'pending'").get(id, userId) as
    | { id: number; account_id: number; date: string; amount_cents: number; description_raw: string; kind: string }
    | undefined;
  if (!row) throw notFound();
  return row;
}

/** A queued expense's day in the person's time zone, for matching. */
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

// ---------------------------------------------------------------- preparing the session

/**
 * Brings the session up to date: cash expenses become lines of the cash account, sure pairings are made,
 * rules give a bucket to lines that have none. Safe to run any number of times.
 */
export function prepareSession(db: Sqlite, user: UserRow) {
  db.transaction(() => {
    // Cash: no bank will ever show these, so the expense itself becomes the line (§5.3, step 2).
    const cash = db
      .prepare("SELECT c.* FROM captures c JOIN accounts a ON a.id = c.account_id WHERE c.user_id = ? AND c.status = 'queued' AND a.kind = 'cash'")
      .all(user.id) as { id: number; account_id: number; amount_cents: number; spent_at: string; note: string | null }[];
    for (const c of cash) {
      db.prepare(
        `INSERT INTO transactions (user_id, account_id, capture_id, date, amount_cents, description_raw, description, fingerprint, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'expense')`
      ).run(user.id, c.account_id, c.id, dayOf(c.spent_at, user.timezone), c.amount_cents, c.note ?? 'Contanti', c.note ?? 'Contanti', `cash:${c.id}`);
      db.prepare("UPDATE captures SET status = 'cash' WHERE id = ?").run(c.id);
    }

    // Sure pairings.
    const { auto } = proposals(db, user);
    for (const p of auto) linkCapture(db, p.captureId, p.lineId, p.score, 'auto');

    // Rules for lines with no bucket yet.
    for (const line of pendingRows(db, user.id)) {
      if (line.kind !== 'expense' || line.bucket_id != null) continue;
      const rule = findRule(db, user.id, line.account_id, line.description_raw);
      if (rule?.bucket_id) {
        book(db, user.id, line.id, rule.bucket_id, 'rule', rule.id);
        db.prepare('UPDATE rules SET times_used = times_used + 1 WHERE id = ?').run(rule.id);
      }
    }
  });
  return sessionView(db, user);
}

function proposals(db: Sqlite, user: UserRow) {
  const captures = listQueue(db, user.id).filter((c) => c.status === 'queued');
  const lines = pendingRows(db, user.id).filter((l) => l.kind === 'expense' && l.match_capture_id == null && l.capture_id == null);
  const rejected = new Set(
    (db.prepare('SELECT capture_id, transaction_id FROM match_rejections r JOIN captures c ON c.id = r.capture_id WHERE c.user_id = ?').all(user.id) as {
      capture_id: number;
      transaction_id: number;
    }[]).map((r) => `${r.capture_id}:${r.transaction_id}`)
  );
  return pairUp(
    captures.map((c) => ({ id: c.id, amountCents: c.amountCents, date: dayOf(c.spentAt, user.timezone), accountId: c.accountId, note: c.note })),
    lines.map((l) => ({ id: l.id, amountCents: l.amount_cents, date: l.date, accountId: l.account_id, description: l.description_raw })),
    rejected
  );
}

function linkCapture(db: Sqlite, captureId: number, lineId: number, score: number, origin: 'auto' | 'user') {
  db.prepare('INSERT INTO matches (capture_id, transaction_id, score, origin) VALUES (?, ?, ?, ?)').run(captureId, lineId, score, origin);
  db.prepare("UPDATE captures SET status = 'matched' WHERE id = ?").run(captureId);
}

/** Books a line in a bucket, in the month of the line; replaces an earlier choice. */
function book(db: Sqlite, userId: number, lineId: number, bucketId: number, origin: 'user' | 'rule', ruleId: number | null) {
  const line = db.prepare('SELECT date, amount_cents FROM transactions WHERE id = ?').get(lineId) as { date: string; amount_cents: number };
  const period = ensurePeriod(db, userId, monthOf(line.date));
  if (period.status === 'closed') throw conflict('periodClosed');
  db.prepare("DELETE FROM budget_entries WHERE transaction_id = ? AND kind = 'spend'").run(lineId);
  db.prepare(
    "INSERT INTO budget_entries (user_id, bucket_id, period_id, amount_cents, kind, transaction_id, origin, rule_id) VALUES (?, ?, ?, ?, 'spend', ?, ?, ?)"
  ).run(userId, bucketId, period.id, line.amount_cents, lineId, origin, ruleId);
}

// ---------------------------------------------------------------- the view

export function sessionView(db: Sqlite, user: UserRow): SessionView {
  const rows = pendingRows(db, user.id);
  const queue = listQueue(db, user.id);
  const { ask } = proposals(db, user);
  const staleBefore = Date.now() - user.unmatched_after_days * 864e5;
  const lines: SessionLine[] = rows.map((r) => {
    const suggestion = r.kind === 'expense' && r.bucket_id == null ? findRule(db, user.id, r.account_id, r.description_raw) : undefined;
    const captureId = r.match_capture_id ?? r.capture_id;
    return {
      id: r.id,
      accountId: r.account_id,
      date: r.date,
      amountCents: r.amount_cents,
      description: r.description,
      descriptionRaw: r.description_raw,
      kind: r.kind,
      budgetBase: !!r.budget_base,
      bucketId: r.bucket_id,
      assignedBy: r.entry_origin === 'rule' ? 'rule' : r.entry_origin ? 'user' : null,
      newRule: r.entry_origin === 'rule' && (r.rule_uses ?? 0) <= 2,
      suggestedBucketId: suggestion?.bucket_id ?? null,
      capture:
        captureId != null
          ? { id: captureId, note: r.capture_note, amountCents: -(r.capture_amount ?? 0), matchedBy: r.match_origin ?? 'user', score: r.match_score ?? 100 }
          : null,
      transferKind: r.transfer_kind,
      fromCash: r.capture_id != null
    };
  });
  const effect = new Map<number, number>();
  for (const l of lines) if (l.bucketId != null) effect.set(l.bucketId, (effect.get(l.bucketId) ?? 0) + l.amountCents);
  return {
    lines,
    ask: ask.map((p) => ({ capture: queue.find((c) => c.id === p.captureId)!, lineId: p.lineId, score: p.score })),
    unmatched: queue
      .filter((c) => c.status === 'queued' && !ask.some((p) => p.captureId === c.id))
      .map((c) => ({ ...c, stale: Date.parse(c.spentAt) < staleBefore })),
    batches: listBatches(db, user.id),
    effect: [...effect.entries()].map(([bucketId, cents]) => ({ bucketId, cents })),
    open: lines.filter((l) => l.kind === 'expense' && l.bucketId == null).length
  };
}

// ---------------------------------------------------------------- decisions

export function confirmMatch(db: Sqlite, user: UserRow, captureId: number, lineId: number) {
  db.transaction(() => {
    const capture = db.prepare("SELECT * FROM captures WHERE id = ? AND user_id = ? AND status = 'queued'").get(captureId, user.id);
    if (!capture) throw notFound();
    const line = ownLine(db, user.id, lineId);
    if (line.kind !== 'expense' || db.prepare('SELECT 1 FROM matches WHERE transaction_id = ?').get(lineId)) throw conflict('lineMatched');
    linkCapture(db, captureId, lineId, 100, 'user');
  });
  return sessionView(db, user);
}

/** "Non è questa": the pairing is never proposed again. Also undoes a pairing already made. */
export function rejectMatch(db: Sqlite, user: UserRow, captureId: number, lineId: number) {
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM captures WHERE id = ? AND user_id = ?').get(captureId, user.id)) throw notFound();
    ownLine(db, user.id, lineId);
    const removed = db.prepare('DELETE FROM matches WHERE capture_id = ? AND transaction_id = ?').run(captureId, lineId);
    if (Number(removed.changes)) db.prepare("UPDATE captures SET status = 'queued' WHERE id = ?").run(captureId);
    db.prepare('INSERT OR IGNORE INTO match_rejections (capture_id, transaction_id) VALUES (?, ?)').run(captureId, lineId);
  });
  return sessionView(db, user);
}

export function assignLine(db: Sqlite, user: UserRow, lineId: number, bucketId: number, remember: boolean) {
  db.transaction(() => {
    const line = ownLine(db, user.id, lineId);
    const bucket = db.prepare('SELECT archived FROM buckets WHERE id = ? AND user_id = ?').get(bucketId, user.id) as { archived: number } | undefined;
    if (!bucket) throw notFound();
    if (bucket.archived) throw badRequest('archivedBucket');
    // A refund booked in a bucket gives money back to it; either way the line is spending.
    if (line.kind !== 'expense') {
      db.prepare("UPDATE transactions SET kind = 'expense', budget_base = 0 WHERE id = ?").run(lineId);
      db.prepare('DELETE FROM transfer_links WHERE from_transaction_id = ?').run(lineId);
    }
    book(db, user.id, lineId, bucketId, 'user', null);
    if (remember) rememberBucket(db, user.id, line.description_raw, bucketId);
  });
  return sessionView(db, user);
}

/** Changes what a line is: a transfer (not in any bucket), income (base budget or not), or an expense. */
export function setLineKind(db: Sqlite, user: UserRow, lineId: number, kind: 'expense' | 'income' | 'transfer', budgetBase: boolean, remember: boolean) {
  db.transaction(() => {
    const line = ownLine(db, user.id, lineId);
    if (db.prepare('SELECT 1 FROM matches WHERE transaction_id = ?').get(lineId) && kind !== 'expense') throw conflict('lineMatched');
    db.prepare('UPDATE transactions SET kind = ?, budget_base = ? WHERE id = ?').run(kind, kind === 'income' && budgetBase ? 1 : 0, lineId);
    if (kind !== 'expense') db.prepare("DELETE FROM budget_entries WHERE transaction_id = ? AND kind = 'spend'").run(lineId);
    db.prepare('DELETE FROM transfer_links WHERE from_transaction_id = ?').run(lineId);
    if (kind === 'transfer') db.prepare("INSERT INTO transfer_links (user_id, kind, from_transaction_id, origin) VALUES (?, 'other', ?, 'user')").run(user.id, lineId);
    if (remember) rememberKind(db, user.id, line.description_raw, kind, budgetBase);
  });
  return sessionView(db, user);
}

/** Closes the session: every expense line has a bucket; all pending lines become reviewed. */
export function closeSession(db: Sqlite, user: UserRow) {
  db.transaction(() => {
    const view = sessionView(db, user);
    if (view.open) throw conflict('unassigned');
    db.prepare("UPDATE transactions SET status = 'reviewed' WHERE user_id = ? AND status = 'pending'").run(user.id);
    db.prepare('UPDATE users SET last_session_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  });
}

