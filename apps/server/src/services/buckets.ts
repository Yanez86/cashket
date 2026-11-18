// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Bucket, BucketInput, BucketKind, FillRule, LeftoverPolicy, OverspendPolicy } from '@cashket/shared';
import { insertedId, type Sqlite } from '../db/core.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

export interface BucketRow {
  id: number;
  user_id: number;
  name: string;
  category: string | null;
  custom_letter: string | null;
  custom_color: string | null;
  kind: BucketKind;
  fill_type: FillRule['type'];
  fill_amount_cents: number | null;
  fill_percent_bp: number | null;
  goal_cents: number | null;
  leftover: LeftoverPolicy['type'];
  leftover_to_bucket_id: number | null;
  leftover_percent_bp: number;
  overspend: OverspendPolicy['type'];
  overspend_from_bucket_id: number | null;
  position: number;
  archived: number;
}

export function fillOf(r: BucketRow): FillRule {
  if (r.fill_type === 'fixed') return { type: 'fixed', amountCents: r.fill_amount_cents ?? 0 };
  if (r.fill_type === 'percent') return { type: 'percent', percent: (r.fill_percent_bp ?? 0) / 100 };
  return { type: 'remainder' };
}

export function leftoverOf(r: BucketRow): LeftoverPolicy {
  if (r.leftover === 'move' && r.leftover_to_bucket_id != null) {
    return { type: 'move', toBucketId: r.leftover_to_bucket_id, percent: r.leftover_percent_bp / 100 };
  }
  // A move whose target was deleted falls back to carrying.
  return r.leftover === 'reset' ? { type: 'reset' } : { type: 'carry' };
}

export function overspendOf(r: BucketRow): OverspendPolicy {
  return r.overspend === 'cover' && r.overspend_from_bucket_id != null
    ? { type: 'cover', fromBucketId: r.overspend_from_bucket_id }
    : { type: 'carry' };
}

export const toBucket = (r: BucketRow, hasHistory = false): Bucket => ({
  id: r.id,
  name: r.name,
  icon: r.category
    ? { kind: 'category', key: r.category as never }
    : { kind: 'custom', letter: r.custom_letter ?? '?', color: r.custom_color ?? '#64748B' },
  kind: r.kind,
  fill: fillOf(r),
  goalCents: r.goal_cents,
  leftover: leftoverOf(r),
  overspend: overspendOf(r),
  position: r.position,
  archived: !!r.archived,
  hasHistory
});

export const bucketRows = (db: Sqlite, userId: number, withArchived = true) =>
  db
    .prepare(`SELECT * FROM buckets WHERE user_id = ? ${withArchived ? '' : 'AND archived = 0'} ORDER BY archived, position, id`)
    .all(userId) as BucketRow[];

export function listBuckets(db: Sqlite, userId: number): Bucket[] {
  const used = usedBucketIds(db, userId);
  return bucketRows(db, userId).map((r) => toBucket(r, used.has(r.id)));
}

function ownBucket(db: Sqlite, userId: number, id: number): BucketRow {
  const row = db.prepare('SELECT * FROM buckets WHERE id = ? AND user_id = ?').get(id, userId) as BucketRow | undefined;
  if (!row) throw notFound();
  return row;
}

export const getBucket = (db: Sqlite, userId: number, id: number) =>
  toBucket(ownBucket(db, userId, id), !!db.prepare('SELECT 1 FROM budget_entries WHERE bucket_id = ? LIMIT 1').get(id));

/** Column values for a bucket, after checking what the form cannot check on its own. */
function columns(db: Sqlite, userId: number, input: BucketInput, selfId?: number) {
  const other = (id: number) => {
    if (id === selfId) throw badRequest('sameBucket');
    if (ownBucket(db, userId, id).archived) throw badRequest('archivedBucket');
  };
  if (input.fill.type === 'remainder') {
    const taken = db
      .prepare("SELECT id FROM buckets WHERE user_id = ? AND fill_type = 'remainder' AND archived = 0 AND id <> ?")
      .get(userId, selfId ?? 0);
    if (taken) throw conflict('remainderTaken');
  }
  if (input.leftover.type === 'move') other(input.leftover.toBucketId);
  if (input.overspend.type === 'cover') other(input.overspend.fromBucketId);
  return [
    input.name,
    input.icon.kind === 'category' ? input.icon.key : null,
    input.icon.kind === 'custom' ? input.icon.letter.slice(0, 1).toUpperCase() : null,
    input.icon.kind === 'custom' ? input.icon.color : null,
    input.kind,
    input.fill.type,
    input.fill.type === 'fixed' ? input.fill.amountCents : null,
    input.fill.type === 'percent' ? Math.round(input.fill.percent * 100) : null,
    input.goalCents,
    input.leftover.type,
    input.leftover.type === 'move' ? input.leftover.toBucketId : null,
    input.leftover.type === 'move' ? Math.round(input.leftover.percent * 100) : 10000,
    input.overspend.type,
    input.overspend.type === 'cover' ? input.overspend.fromBucketId : null
  ];
}

const COLUMN_LIST =
  'name, category, custom_letter, custom_color, kind, fill_type, fill_amount_cents, fill_percent_bp, goal_cents, leftover, leftover_to_bucket_id, leftover_percent_bp, overspend, overspend_from_bucket_id';

export function createBucket(db: Sqlite, userId: number, input: BucketInput): Bucket {
  const values = columns(db, userId, input);
  const position = (db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS p FROM buckets WHERE user_id = ?').get(userId) as { p: number }).p;
  const id = insertedId(
    db
      .prepare(`INSERT INTO buckets (user_id, ${COLUMN_LIST}, position) VALUES (?, ${values.map(() => '?').join(', ')}, ?)`)
      .run(userId, ...values, position)
  );
  return getBucket(db, userId, id);
}

export function updateBucket(db: Sqlite, userId: number, id: number, input: BucketInput): Bucket {
  ownBucket(db, userId, id);
  const values = columns(db, userId, input, id);
  const set = COLUMN_LIST.split(', ')
    .map((c) => `${c} = ?`)
    .join(', ');
  db.prepare(`UPDATE buckets SET ${set} WHERE id = ?`).run(...values, id);
  return getBucket(db, userId, id);
}

/** Archiving keeps the bucket's history; other buckets that pointed at it fall back to their defaults. */
export function setArchived(db: Sqlite, userId: number, id: number, archived: boolean): Bucket {
  const row = ownBucket(db, userId, id);
  if (!archived && row.fill_type === 'remainder') {
    const taken = db
      .prepare("SELECT id FROM buckets WHERE user_id = ? AND fill_type = 'remainder' AND archived = 0 AND id <> ?")
      .get(userId, id);
    if (taken) throw conflict('remainderTaken');
  }
  db.transaction(() => {
    db.prepare('UPDATE buckets SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
    if (archived) {
      db.prepare("UPDATE buckets SET leftover = 'carry', leftover_to_bucket_id = NULL WHERE leftover_to_bucket_id = ?").run(id);
      db.prepare("UPDATE buckets SET overspend = 'carry', overspend_from_bucket_id = NULL WHERE overspend_from_bucket_id = ?").run(id);
    }
  });
  return getBucket(db, userId, id);
}

export function reorderBuckets(db: Sqlite, userId: number, ids: number[]) {
  db.transaction(() => {
    ids.forEach((id, position) => db.prepare('UPDATE buckets SET position = ? WHERE id = ? AND user_id = ?').run(position, id, userId));
  });
}

/** Deletes a bucket that never held money; one with history can only be archived. */
export function deleteBucket(db: Sqlite, userId: number, id: number) {
  ownBucket(db, userId, id);
  if (db.prepare('SELECT 1 FROM budget_entries WHERE bucket_id = ? LIMIT 1').get(id)) throw conflict('bucketUsed');
  db.transaction(() => {
    db.prepare("UPDATE buckets SET leftover = 'carry', leftover_to_bucket_id = NULL WHERE leftover_to_bucket_id = ?").run(id);
    db.prepare("UPDATE buckets SET overspend = 'carry', overspend_from_bucket_id = NULL WHERE overspend_from_bucket_id = ?").run(id);
    db.prepare('DELETE FROM buckets WHERE id = ?').run(id);
  });
}

export const usedBucketIds = (db: Sqlite, userId: number) =>
  new Set((db.prepare('SELECT DISTINCT bucket_id AS id FROM budget_entries WHERE user_id = ?').all(userId) as { id: number }[]).map((r) => r.id));
