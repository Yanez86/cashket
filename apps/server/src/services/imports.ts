// SPDX-License-Identifier: AGPL-3.0-or-later
// Importing bank lines (docs/SPEC.md §7): doubles skipped by fingerprint, transfers recognised, each
// import a batch that can be undone as a whole.
import { createHash } from 'node:crypto';
import { cleanDescription, type ImportBatch, type ImportMapping, type ImportProfile, type ImportRow } from '@cashket/shared';
import { insertedId, type Sqlite } from '../db/core.ts';
import { conflict, notFound } from '../errors.ts';
import { getAccount, listAccounts } from './accounts.ts';
import { findRule } from './rules.ts';

interface BatchRow {
  id: number;
  source: ImportBatch['source'];
  profile_id: number | null;
  file_name: string | null;
  rows_read: number;
  rows_new: number;
  rows_skipped: number;
  undone_at: string | null;
  created_at: string;
  account_id: number | null;
}

const toBatch = (r: BatchRow): ImportBatch => ({
  id: r.id,
  accountId: r.account_id,
  source: r.source,
  fileName: r.file_name,
  rowsRead: r.rows_read,
  rowsNew: r.rows_new,
  rowsSkipped: r.rows_skipped,
  undone: !!r.undone_at,
  createdAt: r.created_at
});

export const listBatches = (db: Sqlite, userId: number, limit = 10) =>
  (
    db
      .prepare(
        `SELECT b.*, (SELECT account_id FROM transactions t WHERE t.batch_id = b.id LIMIT 1) AS account_id
         FROM import_batches b WHERE b.user_id = ? ORDER BY b.id DESC LIMIT ?`
      )
      .all(userId, limit) as BatchRow[]
  ).map(toBatch);

// ---------------------------------------------------------------- profiles

interface ProfileRow {
  id: number;
  account_id: number;
  name: string;
  mapping: string;
  header_fingerprint: string | null;
}

const toProfile = (r: ProfileRow): ImportProfile => ({
  id: r.id,
  accountId: r.account_id,
  name: r.name,
  headerFingerprint: r.header_fingerprint,
  mapping: JSON.parse(r.mapping) as ImportMapping
});

export const listProfiles = (db: Sqlite, userId: number) =>
  (db.prepare('SELECT * FROM import_profiles WHERE user_id = ? ORDER BY id DESC').all(userId) as ProfileRow[]).map(toProfile);

/** One profile per account and file layout: saving again replaces the mapping. */
export function saveProfile(db: Sqlite, userId: number, accountId: number, headerFingerprint: string, mapping: ImportMapping): number {
  const account = getAccount(db, userId, accountId);
  const found = db
    .prepare('SELECT id FROM import_profiles WHERE user_id = ? AND account_id = ? AND header_fingerprint = ?')
    .get(userId, accountId, headerFingerprint) as { id: number } | undefined;
  if (found) {
    db.prepare('UPDATE import_profiles SET mapping = ? WHERE id = ?').run(JSON.stringify(mapping), found.id);
    return found.id;
  }
  return insertedId(
    db
      .prepare("INSERT INTO import_profiles (user_id, account_id, name, format, mapping, header_fingerprint) VALUES (?, ?, ?, 'csv', ?, ?)")
      .run(userId, accountId, account.name, JSON.stringify(mapping), headerFingerprint)
  );
}

// ---------------------------------------------------------------- importing

export interface ImportInput {
  accountId: number;
  fileName: string | null;
  fileSha256: string | null;
  rows: ImportRow[];
  profile: { headerFingerprint: string; mapping: ImportMapping } | null;
  /** Lines downloaded from a bank connection rather than a file. */
  connectionId?: number | null;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** What kind of line this is before any bucket: income, expense, or the same money seen twice. */
function classify(db: Sqlite, userId: number, accountId: number, row: ImportRow) {
  const raw = row.description.toLowerCase();
  const rule = findRule(db, userId, accountId, row.description);
  if (rule?.set_kind) return { kind: rule.set_kind, budgetBase: rule.set_budget_base ?? 0, transfer: rule.set_kind === 'transfer' ? ('other' as const) : null };
  if (row.amountCents < 0) {
    const account = getAccount(db, userId, accountId);
    if (account.kind !== 'cash' && /\b(prelievo|prelevamento|atm|bancomat)\b/.test(raw)) return { kind: 'transfer' as const, budgetBase: 0, transfer: 'withdrawal' as const };
    // The monthly charge of a card that settles here: its expenses come from the card's own statement.
    const cards = listAccounts(db, userId).filter((a) => a.kind === 'card' && a.settlesToAccountId === accountId);
    if (cards.some((c) => raw.includes(c.name.toLowerCase())) || (cards.length && /(carta di credito|addebito carta|estratto conto carta|saldo carta)/.test(raw))) {
      return { kind: 'transfer' as const, budgetBase: 0, transfer: 'card_settlement' as const };
    }
    if (account.kind !== 'paypal' && /\bpaypal\b/.test(raw) && listAccounts(db, userId).some((a) => a.kind === 'paypal' && !a.archived)) {
      return { kind: 'transfer' as const, budgetBase: 0, transfer: 'paypal_funding' as const };
    }
    return { kind: 'expense' as const, budgetBase: 0, transfer: null };
  }
  return { kind: 'income' as const, budgetBase: rule?.set_budget_base ?? 0, transfer: null };
}

export function importRows(db: Sqlite, userId: number, input: ImportInput): ImportBatch {
  getAccount(db, userId, input.accountId);
  return db.transaction(() => {
    const profileId = input.profile ? saveProfile(db, userId, input.accountId, input.profile.headerFingerprint, input.profile.mapping) : null;
    const batchId = insertedId(
      db
        .prepare('INSERT INTO import_batches (user_id, source, profile_id, connection_id, file_name, file_sha256, rows_read) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, input.connectionId ? 'api' : 'csv', profileId, input.connectionId ?? null, input.fileName, input.fileSha256, input.rows.length)
    );
    const seen = new Map<string, number>();
    const exists = db.prepare('SELECT 1 FROM transactions WHERE account_id = ? AND fingerprint = ?');
    const insert = db.prepare(
      `INSERT INTO transactions (user_id, account_id, batch_id, date, value_date, amount_cents, description_raw, description, external_id, fingerprint, kind, budget_base)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let added = 0;
    for (const row of input.rows) {
      const base = `${input.accountId}|${row.date}|${row.amountCents}|${row.description}`;
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      const fingerprint = row.externalId ? `id:${row.externalId}` : sha(`${base}|${occurrence}`);
      if (exists.get(input.accountId, fingerprint)) continue;
      const c = classify(db, userId, input.accountId, row);
      const id = insertedId(
        insert.run(userId, input.accountId, batchId, row.date, row.valueDate, row.amountCents, row.description, cleanDescription(row.description), row.externalId, fingerprint, c.kind, c.budgetBase)
      );
      if (c.transfer) {
        db.prepare("INSERT INTO transfer_links (user_id, kind, from_transaction_id, origin) VALUES (?, ?, ?, 'auto')").run(userId, c.transfer, id);
      }
      added++;
    }
    db.prepare('UPDATE import_batches SET rows_new = ?, rows_skipped = ? WHERE id = ?').run(added, input.rows.length - added, batchId);
    return listBatches(db, userId, 50).find((b) => b.id === batchId)!;
  });
}

/**
 * Takes a batch back: its lines go, expenses matched to them return to the queue. Refused when one of its
 * lines was already reviewed in a closed session or booked in a closed month.
 */
export function undoBatch(db: Sqlite, userId: number, batchId: number) {
  const batch = db.prepare('SELECT * FROM import_batches WHERE id = ? AND user_id = ?').get(batchId, userId) as { undone_at: string | null } | undefined;
  if (!batch || batch.undone_at) throw notFound();
  db.transaction(() => {
    const reviewed = db.prepare("SELECT 1 FROM transactions WHERE batch_id = ? AND status = 'reviewed' LIMIT 1").get(batchId);
    const closed = db
      .prepare(
        `SELECT 1 FROM budget_entries e JOIN periods p ON p.id = e.period_id JOIN transactions t ON t.id = e.transaction_id
         WHERE t.batch_id = ? AND p.status = 'closed' LIMIT 1`
      )
      .get(batchId);
    if (reviewed || closed) throw conflict('batchReviewed');
    db.prepare(
      "UPDATE captures SET status = 'queued' WHERE id IN (SELECT m.capture_id FROM matches m JOIN transactions t ON t.id = m.transaction_id WHERE t.batch_id = ?)"
    ).run(batchId);
    db.prepare('DELETE FROM transactions WHERE batch_id = ?').run(batchId);
    db.prepare('UPDATE import_batches SET undone_at = ? WHERE id = ?').run(new Date().toISOString(), batchId);
  });
}
