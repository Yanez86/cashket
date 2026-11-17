// SPDX-License-Identifier: AGPL-3.0-or-later
// Turning bank descriptions into something readable (docs/SPEC.md §7.2), and comparing them with notes.

const NOISE = [
  /\b(pagamento|pagam\.?|acquisto|operazione|pos|carta|card|n\.?|num\.?|del|ore|it|ita|eur|cod\.?|rif\.?|tramite|presso|con|di|su)\b/gi,
  /\*+\s*\d{2,}/g, // *1234
  /\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, // dates
  /\b\d{1,2}[:.]\d{2}\b/g, // times
  /\b[a-z]*\d[a-z\d]{3,}\b/gi, // codes with digits
  /\b\d+\b/g,
  /[*#_]+/g
];

/** "POS 16/11 ESSELUNGA MILANO 0431 CARTA *1234" → "Esselunga Milano". Keeps at most four words. */
export function cleanDescription(raw: string): string {
  let s = raw;
  for (const re of NOISE) s = s.replace(re, ' ');
  const words = s
    .replace(/[^\p{L}\p{N}&'.\- ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^[.\-']+$/.test(w))
    .slice(0, 4);
  if (!words.length) return raw.trim().slice(0, 60);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** The part of a description a rule remembers: the cleaned name, lower case. */
export const rulePattern = (raw: string) => cleanDescription(raw).toLowerCase();

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/** 0–1: how much a note ("pranzo da luigi") shares with a description ("RISTORANTE DA LUIGI"). */
export function textSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}
