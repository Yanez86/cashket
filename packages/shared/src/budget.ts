// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure budget arithmetic, shared by server and web. See docs/SPEC.md §4.
import type { BucketKind, BucketStatus, FillRule, LeftoverPolicy, OverspendPolicy } from './types.ts';

// ---------------------------------------------------------------- months

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (value: string) => MONTH.test(value);

/** '2026-11-17' or a Date → '2026-11'. A Date is read in the given time zone. */
export function monthOf(date: string | Date, timeZone = 'Europe/Rome'): string {
  if (typeof date === 'string') return date.slice(0, 7);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** First and last day of a month, as ISO dates. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ---------------------------------------------------------------- filling the buckets

export interface FillInput {
  id: number;
  fill: FillRule;
}

export interface FillPlan {
  allocations: { bucketId: number; cents: number }[];
  /** What is left after every bucket: 0 with a remainder bucket, negative when income does not cover fixed and percent buckets. */
  unassignedCents: number;
}

/**
 * Splits a period's base income: fixed buckets first, then percentages of the income, then the single
 * remainder bucket takes what is left. Nothing is cut when income is short: the shortfall shows as a
 * negative "unassigned" amount and the remainder bucket gets nothing.
 */
export function planFill(buckets: FillInput[], incomeCents: number): FillPlan {
  const allocations: FillPlan['allocations'] = [];
  let used = 0;
  for (const b of buckets) {
    if (b.fill.type !== 'fixed') continue;
    allocations.push({ bucketId: b.id, cents: b.fill.amountCents });
    used += b.fill.amountCents;
  }
  for (const b of buckets) {
    if (b.fill.type !== 'percent') continue;
    const cents = Math.round((incomeCents * b.fill.percent) / 100);
    allocations.push({ bucketId: b.id, cents });
    used += cents;
  }
  const left = incomeCents - used;
  const remainder = buckets.find((b) => b.fill.type === 'remainder');
  if (remainder) {
    const cents = Math.max(0, left);
    allocations.push({ bucketId: remainder.id, cents });
    return { allocations, unassignedCents: left - cents };
  }
  return { allocations, unassignedCents: left };
}

// ---------------------------------------------------------------- closing a period

export interface CloseInput {
  id: number;
  balanceCents: number;
  leftover: LeftoverPolicy;
  overspend: OverspendPolicy;
}

/** Entries to write at the start of the next period. Bucket balances are per period, so carrying is explicit. */
export interface Rollover {
  bucketId: number;
  cents: number;
  /** The bucket whose balance this comes from. */
  fromBucketId: number;
}

export function planClose(buckets: CloseInput[]): Rollover[] {
  const out: Rollover[] = [];
  const ids = new Set(buckets.map((b) => b.id));
  for (const b of buckets) {
    const bal = b.balanceCents;
    if (bal > 0) {
      if (b.leftover.type === 'carry') out.push({ bucketId: b.id, cents: bal, fromBucketId: b.id });
      else if (b.leftover.type === 'move' && ids.has(b.leftover.toBucketId)) {
        const moved = Math.round((bal * b.leftover.percent) / 100);
        if (moved) out.push({ bucketId: b.leftover.toBucketId, cents: moved, fromBucketId: b.id });
        // The part that is not moved goes back to "unassigned", like a reset.
      }
    } else if (bal < 0) {
      if (b.overspend.type === 'cover' && ids.has(b.overspend.fromBucketId)) {
        out.push({ bucketId: b.overspend.fromBucketId, cents: bal, fromBucketId: b.id });
      } else out.push({ bucketId: b.id, cents: bal, fromBucketId: b.id });
    }
  }
  return out;
}

// ---------------------------------------------------------------- state of a bucket

export function bucketStatus(kind: BucketKind, balanceCents: number): BucketStatus {
  if (balanceCents < 0) return 'over';
  return kind === 'saving' ? 'saving' : 'ok';
}
