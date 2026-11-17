// SPDX-License-Identifier: AGPL-3.0-or-later
import { formatCents, type Bucket } from '@cashket/shared';

const percent = (p: number) => `${p.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

/** "Fisso 450,00 €", "10% delle entrate", "Riceve il resto", plus the goal of a saving bucket. */
export function fillText(b: Pick<Bucket, 'fill' | 'kind' | 'goalCents'>): string {
  const fill =
    b.fill.type === 'fixed' ? `Fisso ${formatCents(b.fill.amountCents)}` : b.fill.type === 'percent' ? `${percent(b.fill.percent)} delle entrate` : 'Riceve il resto';
  return b.kind === 'saving' ? `Accumulo · ${fill}` : fill;
}

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T00:00:00Z`));
