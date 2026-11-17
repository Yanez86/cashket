// SPDX-License-Identifier: AGPL-3.0-or-later
// The capture queue (docs/SPEC.md §5.1): expenses typed during the day, without a bucket, waiting for a
// session. Amounts are stored negative like every outgoing amount and shown positive.
import type { Capture, CaptureInput, CaptureStatus, QueueSummary } from '@cashket/shared';
import { insertedId, type Sqlite } from '../db/core.ts';
import { conflict, notFound } from '../errors.ts';
import { getAccount } from './accounts.ts';

interface CaptureRow {
  id: number;
  user_id: number;
  amount_cents: number;
  spent_at: string;
  account_id: number | null;
  note: string | null;
  status: CaptureStatus;
  client_id: string | null;
}

const toCapture = (r: CaptureRow): Capture => ({
  id: r.id,
  amountCents: -r.amount_cents,
  spentAt: r.spent_at,
  accountId: r.account_id,
  note: r.note,
  status: r.status,
  clientId: r.client_id
});

export const listQueue = (db: Sqlite, userId: number) =>
  (db.prepare("SELECT * FROM captures WHERE user_id = ? AND status = 'queued' ORDER BY spent_at DESC, id DESC").all(userId) as CaptureRow[]).map(toCapture);

export function queueSummary(db: Sqlite, userId: number): QueueSummary {
  const r = db
    .prepare("SELECT COUNT(*) AS count, COALESCE(-SUM(amount_cents), 0) AS total FROM captures WHERE user_id = ? AND status = 'queued'")
    .get(userId) as { count: number; total: number };
  return { count: r.count, totalCents: r.total };
}

function own(db: Sqlite, userId: number, id: number): CaptureRow {
  const row = db.prepare('SELECT * FROM captures WHERE id = ? AND user_id = ?').get(id, userId) as CaptureRow | undefined;
  if (!row) throw notFound();
  return row;
}

/** Saves an expense in the queue. The same clientId sent again returns the expense already saved. */
export function createCapture(db: Sqlite, userId: number, input: CaptureInput): Capture {
  if (input.clientId) {
    const existing = db.prepare('SELECT * FROM captures WHERE user_id = ? AND client_id = ?').get(userId, input.clientId) as CaptureRow | undefined;
    if (existing) return toCapture(existing);
  }
  if (input.accountId != null) getAccount(db, userId, input.accountId);
  const id = insertedId(
    db
      .prepare('INSERT INTO captures (user_id, amount_cents, spent_at, account_id, note, client_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, -input.amountCents, input.spentAt, input.accountId, input.note, input.clientId ?? null)
  );
  return toCapture(own(db, userId, id));
}

/** Only an expense still in the queue can change: one already matched belongs to its bank line. */
export function updateCapture(db: Sqlite, userId: number, id: number, patch: Partial<Omit<CaptureInput, 'clientId'>>): Capture {
  const row = own(db, userId, id);
  if (row.status !== 'queued') throw conflict('captureDone');
  if (patch.accountId != null) getAccount(db, userId, patch.accountId);
  db.prepare('UPDATE captures SET amount_cents = ?, spent_at = ?, account_id = ?, note = ? WHERE id = ?').run(
    patch.amountCents !== undefined ? -patch.amountCents : row.amount_cents,
    patch.spentAt ?? row.spent_at,
    patch.accountId !== undefined ? patch.accountId : row.account_id,
    patch.note !== undefined ? patch.note : row.note,
    id
  );
  return toCapture(own(db, userId, id));
}

export function deleteCapture(db: Sqlite, userId: number, id: number) {
  const row = own(db, userId, id);
  if (row.status !== 'queued') throw conflict('captureDone');
  db.prepare('DELETE FROM captures WHERE id = ?').run(id);
}
