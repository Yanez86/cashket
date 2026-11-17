// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, categoryByKey } from './categories.ts';

test('categories have unique keys and hex tints', () => {
  const keys = CATEGORIES.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, 24);
  for (const c of CATEGORIES) assert.match(c.tint, /^#[0-9A-F]{6}$/i);
});

test('categoryByKey finds a category', () => {
  assert.equal(categoryByKey('groceries')?.label, 'Spesa');
  assert.equal(categoryByKey('nope'), undefined);
});
