// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { CATEGORIES, CUSTOM_COLORS, isMonth } from '@cashket/shared';

export const zEmail = z.string().trim().toLowerCase().email().max(200);
export const zPassword = z.string().min(10).max(200);
export const zName = z.string().trim().min(1).max(100);
export const zLocale = z.enum(['it', 'en']);
export const zTheme = z.enum(['system', 'light', 'dark']);
export const zTimezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  });
export const zId = z.coerce.number().int().positive();
export const zMonth = z.string().refine(isMonth);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)));
/** Money in integer cents, up to ten million euros. */
export const zCents = z.number().int().min(0).max(1_000_000_000);

const categoryKeys = CATEGORIES.map((c) => c.key) as [string, ...string[]];

export const zBucketIcon = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('category'), key: z.enum(categoryKeys) }),
  z.object({ kind: z.literal('custom'), letter: z.string().trim().min(1).max(4), color: z.enum(CUSTOM_COLORS) })
]);

/** Up to two decimals, as the database keeps basis points. */
const zPercent = z.number().gt(0).max(100).refine((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-9);

export const zBucketInput = z.object({
  name: zName,
  icon: zBucketIcon,
  kind: z.enum(['spend', 'saving']),
  fill: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), amountCents: zCents }),
    z.object({ type: z.literal('percent'), percent: zPercent }),
    z.object({ type: z.literal('remainder') })
  ]),
  goalCents: zCents.nullable(),
  leftover: z.discriminatedUnion('type', [
    z.object({ type: z.literal('carry') }),
    z.object({ type: z.literal('move'), toBucketId: zId, percent: zPercent }),
    z.object({ type: z.literal('reset') })
  ]),
  overspend: z.discriminatedUnion('type', [z.object({ type: z.literal('carry') }), z.object({ type: z.literal('cover'), fromBucketId: zId })])
});
