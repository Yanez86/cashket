// SPDX-License-Identifier: AGPL-3.0-or-later
// Shapes of the JSON the server sends and the web app reads.
import type { BucketIcon } from './categories.ts';
import type { AccountKind, BucketKind, BucketStatus, FillRule, LeftoverPolicy, OverspendPolicy, Role } from './types.ts';

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
}
