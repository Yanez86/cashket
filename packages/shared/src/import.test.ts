// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMapping, detectDelimiter, guessMapping, headerFingerprint, parseCsv, parseDate } from './csv.ts';
import { cleanDescription, rulePattern, textSimilarity } from './describe.ts';
import { matchScore, pairUp } from './match.ts';

const BANK = `﻿Estratto conto;;;;
Data contabile;Data valuta;Descrizione;Dare;Avere
17/11/2026;17/11/2026;"POS 16/11 ESSELUNGA MILANO 0431 CARTA *1234";54,30;
18/11/2026;18/11/2026;"BONIFICO ""STIPENDIO"" ACME SPA";;2.350,00
19/11/2026;19/11/2026;ADDEBITO NEXI;1.234,56;
;;Saldo finale;;9.999,00
`;

test('csv: delimiter, quotes, BOM', () => {
  assert.equal(detectDelimiter(BANK), ';');
  assert.equal(detectDelimiter('a,b,c\n1,2,3\n'), ',');
  const t = parseCsv(BANK);
  assert.equal(t[2][2], 'POS 16/11 ESSELUNGA MILANO 0431 CARTA *1234');
  assert.equal(t[3][2], 'BONIFICO "STIPENDIO" ACME SPA');
  assert.equal(t[0][0], 'Estratto conto');
});

test('dates', () => {
  assert.equal(parseDate('17/11/2026', 'dd/mm/yyyy'), '2026-11-17');
  assert.equal(parseDate('7-1-26', 'dd/mm/yyyy'), '2026-01-07');
  assert.equal(parseDate('2026-11-17T10:00', 'yyyy-mm-dd'), '2026-11-17');
  assert.equal(parseDate('31/02/2026', 'dd/mm/yyyy'), null);
  assert.equal(parseDate('Saldo', 'dd/mm/yyyy'), null);
});

test('mapping: guessed from the header, debit and credit columns', () => {
  const t = parseCsv(BANK);
  const m = guessMapping(t, ';');
  assert.equal(m.headerRow, 1);
  assert.equal(m.dateColumn, 0);
  assert.equal(m.valueDateColumn, 1);
  assert.deepEqual(m.descriptionColumns, [2]);
  assert.deepEqual(m.amount, { mode: 'split', debitColumn: 3, creditColumn: 4 });
  const { rows, errors } = applyMapping(t, m);
  assert.deepEqual(
    rows.map((r) => [r.date, r.amountCents]),
    [
      ['2026-11-17', -5430],
      ['2026-11-18', 235000],
      ['2026-11-19', -123456]
    ]
  );
  assert.deepEqual(errors, [{ line: 6, message: 'data non valida' }]);
  assert.equal(headerFingerprint(t[1]), 'data contabile|data valuta|descrizione|dare|avere');
});

test('mapping: a single amount column, card exports with positive expenses', () => {
  const t = parseCsv('Data,Esercente,Importo\n2026-11-16,ENI STATION,45.00\n');
  const m = guessMapping(t, ',');
  assert.equal(m.dateFormat, 'yyyy-mm-dd');
  const inverted = { ...m, amount: { mode: 'single' as const, column: 2, invert: true } };
  assert.equal(applyMapping(t, inverted).rows[0].amountCents, -4500);
});

test('descriptions', () => {
  assert.equal(cleanDescription('POS 16/11 ESSELUNGA MILANO 0431 CARTA *1234'), 'Esselunga Milano');
  assert.equal(cleanDescription('PAGAMENTO POS NETFLIX.COM 15/11 ORE 10:22'), 'Netflix.com');
  assert.equal(rulePattern('POS 02/12 ESSELUNGA MILANO 0577 CARTA *1234'), 'esselunga milano');
  assert.equal(textSimilarity('pranzo da luigi', 'RISTORANTE DA LUIGI'), 1 / 2);
});

test('matching: exact, tolerance, account, rivals', () => {
  const pranzo = { id: 1, amountCents: 1250, date: '2026-11-17', accountId: 7, note: 'Pranzo da Luigi' };
  const luigi = { id: 10, amountCents: -1300, date: '2026-11-17', accountId: 7, description: 'RISTORANTE DA LUIGI' };
  assert.ok(matchScore(pranzo, luigi) >= 45 && matchScore(pranzo, luigi) < 80);
  assert.equal(matchScore(pranzo, { ...luigi, accountId: 8 }), 0);
  assert.equal(matchScore(pranzo, { ...luigi, date: '2026-11-25' }), 0);
  const benzina = { id: 2, amountCents: 4500, date: '2026-11-16', accountId: 7, note: 'Benzina' };
  const eni = { id: 11, amountCents: -4500, date: '2026-11-16', accountId: 7, description: 'ENI STATION' };
  assert.ok(matchScore(benzina, eni) >= 80);

  const { auto, ask } = pairUp([pranzo, benzina], [luigi, eni]);
  assert.deepEqual(auto, [{ captureId: 2, lineId: 11, score: matchScore(benzina, eni) }]);
  assert.deepEqual(ask.map((p) => [p.captureId, p.lineId]), [[1, 10]]);

  // Two identical coffees and two identical lines: asked, not guessed.
  const c1 = { id: 3, amountCents: 120, date: '2026-11-17', accountId: 7, note: null };
  const c2 = { ...c1, id: 4 };
  const l1 = { id: 12, amountCents: -120, date: '2026-11-17', accountId: 7, description: 'BAR' };
  const l2 = { ...l1, id: 13 };
  const coffee = pairUp([c1, c2], [l1, l2]);
  assert.equal(coffee.auto.length, 0);
  assert.equal(coffee.ask.length, 2);
  // A pairing said "no" to is not proposed again.
  assert.equal(pairUp([benzina], [eni], new Set(['2:11'])).auto.length, 0);
});
