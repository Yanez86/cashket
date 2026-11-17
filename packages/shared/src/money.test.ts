// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCents, parseAmount } from './money.ts';

test('parseAmount reads Italian bank formats', () => {
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('-12,5'), -1250);
  assert.equal(parseAmount('12'), 1200);
  assert.equal(parseAmount('12.50'), 1250);
  assert.equal(parseAmount('1.234'), 123400);
  assert.equal(parseAmount(' 45,00 € '), 4500);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('formatCents writes euros with a real minus sign', () => {
  assert.match(formatCents(123456), /1\.234,56\s€/);
  assert.match(formatCents(-1630), /^−16,30\s€$/);
});
