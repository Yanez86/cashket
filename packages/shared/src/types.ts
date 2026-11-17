// SPDX-License-Identifier: AGPL-3.0-or-later
// Domain vocabulary shared by server and web. See docs/SPEC.md §3–§8.

export type Role = 'admin' | 'member';

export type AccountKind = 'checking' | 'card' | 'paypal' | 'cash';

/** spend: refilled every period. saving: never reset, optional goal. */
export type BucketKind = 'spend' | 'saving';

/** How a bucket is filled each period, applied in this order: fixed, percent, remainder. */
export type FillRule =
  | { type: 'fixed'; amountCents: number }
  | { type: 'percent'; percent: number } // 10 = 10%, two decimals at most
  | { type: 'remainder' };

/** What happens to what is left at the end of a period. */
export type LeftoverPolicy =
  | { type: 'carry' }
  | { type: 'move'; toBucketId: number; percent: number } // share moved, 0–100; the rest is reset
  | { type: 'reset' };

/** What happens when a bucket ends a period below zero. */
export type OverspendPolicy = { type: 'carry' } | { type: 'cover'; fromBucketId: number };

export type CaptureStatus = 'queued' | 'matched' | 'cash' | 'discarded';

export type TransactionKind = 'expense' | 'income' | 'transfer';

export type TransactionStatus = 'pending' | 'reviewed';

export type ImportSource = 'csv' | 'api' | 'email';

export type BudgetEntryKind = 'allocation' | 'spend' | 'move' | 'rollover';

export type MatchOrigin = 'auto' | 'user';

/** Bucket health shown on cards and bars. */
export type BucketStatus = 'ok' | 'saving' | 'over';
