// SPDX-License-Identifier: AGPL-3.0-or-later
// Reading bank exports (docs/SPEC.md §7.1). Pure functions: the web app uses them for the preview and the
// column mapping, then sends the server rows already read.
import { parseAmount } from './money.ts';

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, CRLF and a leading BOM. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** The delimiter that splits the first lines most evenly: Italian banks mostly use ";". */
export function detectDelimiter(text: string): string {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(0, 20);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1).filter((n) => n > 0);
    if (!counts.length) continue;
    // Many lines with the same count beat a single line with many.
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    const score = counts.filter((n) => n === mode).length * 10 + mode;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export type DateFormat = 'dd/mm/yyyy' | 'yyyy-mm-dd' | 'mm/dd/yyyy';

/** Reads a date cell ("17/11/2026", "17-11-26", "2026-11-17", "17.11.2026 10:30") as 'YYYY-MM-DD'. */
export function parseDate(text: string, format: DateFormat): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  if (format === 'yyyy-mm-dd') {
    const r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
    if (!r) return null;
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else {
    const r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(t);
    if (!r) return null;
    const [a, b] = [Number(r[1]), Number(r[2])];
    [d, m] = format === 'dd/mm/yyyy' ? [a, b] : [b, a];
    y = r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3]);
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** How to read one bank's export. Columns are 0-based; headerRow is the row with the column names. */
export interface ImportMapping {
  delimiter: string;
  headerRow: number;
  dateColumn: number;
  dateFormat: DateFormat;
  valueDateColumn: number | null;
  /** Joined with a space: some banks split the description over two columns. */
  descriptionColumns: number[];
  amount: { mode: 'single'; column: number; invert: boolean } | { mode: 'split'; debitColumn: number; creditColumn: number };
  idColumn: number | null;
}

export interface ImportRow {
  date: string;
  valueDate: string | null;
  /** Negative = money going out. */
  amountCents: number;
  description: string;
  externalId: string | null;
}

export interface MappedRows {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
}

/** Lines after the header, read with the mapping. Totals and notes at the bottom end up in errors, not rows. */
export function applyMapping(table: string[][], mapping: ImportMapping): MappedRows {
  const rows: ImportRow[] = [];
  const errors: MappedRows['errors'] = [];
  table.slice(mapping.headerRow + 1).forEach((cells, i) => {
    const line = mapping.headerRow + i + 2;
    const date = parseDate(cells[mapping.dateColumn] ?? '', mapping.dateFormat);
    if (!date) return void errors.push({ line, message: 'data non valida' });
    let amount: number | null;
    if (mapping.amount.mode === 'single') {
      amount = parseAmount(cells[mapping.amount.column] ?? '');
      if (amount != null && mapping.amount.invert) amount = -amount;
    } else {
      const debit = parseAmount(cells[mapping.amount.debitColumn] ?? '');
      const credit = parseAmount(cells[mapping.amount.creditColumn] ?? '');
      amount = debit == null && credit == null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (amount == null || amount === 0) return void errors.push({ line, message: 'importo non valido' });
    const description = mapping.descriptionColumns
      .map((c) => cells[c] ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description) return void errors.push({ line, message: 'descrizione vuota' });
    const valueDate = mapping.valueDateColumn == null ? null : parseDate(cells[mapping.valueDateColumn] ?? '', mapping.dateFormat);
    const externalId = mapping.idColumn == null ? null : (cells[mapping.idColumn] ?? '').trim() || null;
    rows.push({ date, valueDate, amountCents: amount, description: description.slice(0, 500), externalId });
  });
  return { rows, errors };
}

/** Identifies a bank's export by its column names, to apply the saved mapping by itself next time. */
export const headerFingerprint = (header: string[]) =>
  header.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' ')).join('|');

/** A first guess at the mapping from the column names, for the person to check. */
export function guessMapping(table: string[][], delimiter: string): ImportMapping {
  const headerRow = Math.max(0, table.findIndex((r) => r.filter((c) => c && Number.isNaN(Number(c.replace(/[.,]/g, '')))).length >= 2));
  const header = (table[headerRow] ?? []).map((h) => h.toLowerCase());
  const find = (...words: string[]) => header.findIndex((h) => words.some((w) => h.includes(w)));
  const date = find('data operazione', 'data contabile', 'data');
  const valueDate = find('valuta');
  const desc = find('descrizione', 'causale', 'esercente', 'dettagli', 'description', 'name', 'nome');
  const debit = find('dare', 'addebiti', 'uscite');
  const credit = find('avere', 'accrediti', 'entrate');
  const amount = find('importo', 'amount', 'lordo', 'gross');
  const sample = table[headerRow + 1]?.[date] ?? '';
  return {
    delimiter,
    headerRow,
    dateColumn: Math.max(0, date),
    dateFormat: /^\d{4}/.test(sample) ? 'yyyy-mm-dd' : 'dd/mm/yyyy',
    valueDateColumn: valueDate >= 0 && valueDate !== date ? valueDate : null,
    descriptionColumns: [desc >= 0 ? desc : Math.min(1, header.length - 1)],
    amount:
      debit >= 0 && credit >= 0 && amount < 0
        ? { mode: 'split', debitColumn: debit, creditColumn: credit }
        : { mode: 'single', column: amount >= 0 ? amount : header.length - 1, invert: false },
    idColumn: null
  };
}
