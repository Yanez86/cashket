// SPDX-License-Identifier: AGPL-3.0-or-later
// Amounts are integer cents everywhere: negative = money going out.

const formatters = new Map<string, Intl.NumberFormat>();

/** 1234 → "12,34 €", 123456 → "1.234,56 €" (it-IT, thousands always grouped). Uses a real minus sign for negative amounts. */
export function formatCents(cents: number, locale = 'it-IT', currency = 'EUR'): string {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    // 'always': Italian otherwise leaves four-digit amounts ungrouped (1234,56). The ES2022 typings only
    // know a boolean here, hence the cast.
    const options = { style: 'currency', currency, minimumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
    f = new Intl.NumberFormat(locale, options);
    formatters.set(key, f);
  }
  return f.format(cents / 100).replace('-', '−');
}

/**
 * Reads an amount written the Italian way ("1.234,56", "-12,5", "12") or with a dot as the decimal
 * separator when there is no comma ("12.50"). Returns integer cents, or null when it is not a number.
 */
export function parseAmount(text: string): number | null {
  let s = text.trim().replace(/\s|€/g, '').replace('−', '-');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
