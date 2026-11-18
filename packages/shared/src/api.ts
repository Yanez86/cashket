// SPDX-License-Identifier: AGPL-3.0-or-later
// Shapes of the JSON the server sends and the web app reads.
import type { BucketIcon } from './categories.ts';
import type { AccountKind, BucketKind, BucketStatus, CaptureStatus, FillRule, LeftoverPolicy, OverspendPolicy, Role } from './types.ts';

export interface Status {
  name: 'Cashket';
  version: string;
  setupRequired: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  locale: string;
  timezone: string;
  theme: 'system' | 'light' | 'dark';
  /** Which month's income the percentage buckets are computed on. */
  percentBase: 'current' | 'previous';
  /** When the last reconciliation session was closed; null before the first. */
  lastSessionAt: string | null;
  /** Remind to do a session when the last one is this many days old (null = no reminder). */
  sessionReminderDays: number | null;
  /** From which local hour the reminder may arrive. */
  reminderHour: number;
}

export interface Invite {
  token: string;
  email: string | null;
  expiresAt: string;
  url: string;
}

export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  settlesToAccountId: number | null;
  position: number;
  archived: boolean;
}

export interface Bucket {
  id: number;
  name: string;
  icon: BucketIcon;
  kind: BucketKind;
  fill: FillRule;
  goalCents: number | null;
  leftover: LeftoverPolicy;
  overspend: OverspendPolicy;
  position: number;
  archived: boolean;
}

/** What a bucket's create or edit form sends. */
export type BucketInput = Omit<Bucket, 'id' | 'position' | 'archived'>;

export interface Income {
  id: number;
  accountId: number;
  date: string;
  amountCents: number;
  description: string;
  budgetBase: boolean;
}

/**
 * An expense typed during the day, waiting in the queue for a session (docs/SPEC.md §5.1). Its amount is
 * what was spent, as a positive number (the database keeps it negative, like every outgoing amount).
 */
export interface Capture {
  id: number;
  amountCents: number;
  /** ISO timestamp of the purchase. */
  spentAt: string;
  accountId: number | null;
  note: string | null;
  status: CaptureStatus;
  clientId: string | null;
}

export interface CaptureInput {
  amountCents: number;
  spentAt: string;
  accountId: number | null;
  note: string | null;
  /** Made by the phone, so an expense sent twice (offline retry) is saved once. */
  clientId?: string | null;
}

export interface QueueSummary {
  count: number;
  totalCents: number;
}

export interface BucketView extends Bucket {
  /** Sum of every entry of the period: rollover + allocation + moves + spending. */
  balanceCents: number;
  allocatedCents: number;
  /** Positive number: what was spent from the bucket in the period. */
  spentCents: number;
  rolloverCents: number;
  status: BucketStatus;
}

export interface BudgetView {
  month: string;
  status: 'open' | 'closed';
  /** The month whose base income fills the percentage buckets. */
  incomeMonth: string;
  incomeCents: number;
  /** True once "Assegna" has been run for the month. */
  allocated: boolean;
  /** What the fill would be with today's income and rules; differs from the allocation when something changed. */
  plan: { bucketId: number; cents: number }[];
  unassignedCents: number;
  buckets: BucketView[];
  /** Expenses waiting in the queue: not in the buckets yet, shown so the month does not look richer than it is. */
  queue: QueueSummary;
}

export interface ImportProfile {
  id: number;
  accountId: number;
  name: string;
  headerFingerprint: string | null;
  mapping: import('./csv.ts').ImportMapping;
}

export interface ImportBatch {
  id: number;
  accountId: number | null;
  source: 'csv' | 'api' | 'email';
  fileName: string | null;
  rowsRead: number;
  rowsNew: number;
  rowsSkipped: number;
  undone: boolean;
  createdAt: string;
}

/** A bank line (or a cash expense) in the session, with what has been decided for it so far. */
export interface SessionLine {
  id: number;
  accountId: number;
  date: string;
  amountCents: number;
  description: string;
  descriptionRaw: string;
  kind: 'expense' | 'income' | 'transfer';
  budgetBase: boolean;
  bucketId: number | null;
  /** Who chose the bucket: the person, a rule, or nobody yet. */
  assignedBy: 'user' | 'rule' | null;
  /** A rule used once or twice so far: worth a look. */
  newRule: boolean;
  /** Bucket a rule would propose, when none is chosen yet. */
  suggestedBucketId: number | null;
  /** The queued expense matched to this line, if any. */
  capture: { id: number; note: string | null; amountCents: number; matchedBy: 'auto' | 'user'; score: number } | null;
  transferKind: 'card_settlement' | 'withdrawal' | 'paypal_funding' | 'other' | null;
  fromCash: boolean;
}

export interface SessionProposal {
  capture: Capture;
  lineId: number;
  score: number;
}

export interface SessionView {
  lines: SessionLine[];
  /** Pairings to confirm with a tap. */
  ask: SessionProposal[];
  /** Queued expenses with no bank line yet; stale ones are older than the person's window. */
  unmatched: (Capture & { stale: boolean })[];
  batches: ImportBatch[];
  /** What the session takes from (or gives back to) each bucket. */
  effect: { bucketId: number; cents: number }[];
  /** Lines that still need a decision before the session can be closed. */
  open: number;
}

export interface BankApp {
  configured: boolean;
  appId: string | null;
  /** Where the bank sends the person back: to register in the Enable Banking application. */
  redirectUrl: string;
}

export interface Aspsp {
  name: string;
  country: string;
  logo: string | null;
  /** Longest consent the bank gives, in days. */
  maxConsentDays: number | null;
}

export interface BankConnection {
  id: number;
  aspspName: string;
  aspspCountry: string;
  status: 'pending' | 'active' | 'expired' | 'error';
  consentExpiresAt: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
  /** The bank's accounts and the Cashket account each feeds (null = not imported). */
  accounts: { uid: string; name: string; iban: string | null; accountId: number | null }[];
}
