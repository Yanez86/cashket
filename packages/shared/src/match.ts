// SPDX-License-Identifier: AGPL-3.0-or-later
// Matching queued expenses with bank lines (docs/SPEC.md §6.2).
import { textSimilarity } from './describe.ts';

export interface MatchCapture {
  id: number;
  /** Positive: what was spent. */
  amountCents: number;
  /** 'YYYY-MM-DD' in the person's time zone. */
  date: string;
  accountId: number | null;
  note: string | null;
}

export interface MatchLine {
  id: number;
  /** Negative: an expense. */
  amountCents: number;
  date: string;
  accountId: number;
  description: string;
}

export const AUTO_SCORE = 80;
export const ASK_SCORE = 45;

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** 0–100, or 0 when the two cannot be the same expense. */
export function matchScore(c: MatchCapture, l: MatchLine): number {
  if (c.accountId != null && c.accountId !== l.accountId) return 0;
  const spent = -l.amountCents;
  if (spent <= 0) return 0;
  // The bank books an expense from the day before (time zones) to five days later.
  const lag = days(c.date, l.date);
  if (lag < -1 || lag > 5) return 0;
  let score = 0;
  const diff = Math.abs(spent - c.amountCents);
  if (diff === 0) score += 50;
  else if (diff <= Math.max(200, Math.round(c.amountCents * 0.05))) score += 25;
  else return 0;
  score += lag <= 0 ? 25 : Math.max(5, 30 - lag * 5);
  if (c.accountId != null) score += 15;
  if (c.note) score += Math.round(10 * textSimilarity(c.note, l.description));
  return Math.min(100, score);
}

export interface Pairing {
  captureId: number;
  lineId: number;
  score: number;
}

/**
 * One line per expense and one expense per line, best scores first. A pairing is "auto" only when it is
 * sure and no other candidate comes close; otherwise it is asked.
 */
export function pairUp(captures: MatchCapture[], lines: MatchLine[], rejected: Set<string> = new Set()): { auto: Pairing[]; ask: Pairing[] } {
  const all: Pairing[] = [];
  for (const c of captures)
    for (const l of lines) {
      if (rejected.has(`${c.id}:${l.id}`)) continue;
      const score = matchScore(c, l);
      if (score >= ASK_SCORE) all.push({ captureId: c.id, lineId: l.id, score });
    }
  all.sort((a, b) => b.score - a.score || a.captureId - b.captureId || a.lineId - b.lineId);
  const usedC = new Set<number>();
  const usedL = new Set<number>();
  const auto: Pairing[] = [];
  const ask: Pairing[] = [];
  for (const p of all) {
    if (usedC.has(p.captureId) || usedL.has(p.lineId)) continue;
    usedC.add(p.captureId);
    usedL.add(p.lineId);
    // Any other candidate within 10 points for the same expense or the same line (two identical coffees)
    // makes it a question: even one left over after the others were paired depends on how they were paired.
    const rival = all.some((q) => q !== p && q.score >= p.score - 10 && (q.captureId === p.captureId || q.lineId === p.lineId));
    (p.score >= AUTO_SCORE && !rival ? auto : ask).push(p);
  }
  return { auto, ask };
}
