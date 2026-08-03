import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAmount, addCents, subCents, formatCents } from '../src/domain/money.mjs';

test('parseAmount accepts decimal dollars as cents', () => {
  assert.equal(parseAmount('1000.00').cents, 100000n);
  assert.equal(parseAmount('970.07').cents, 97007n);
});

test('add and sub cents', () => {
  assert.equal(addCents(100n, 50n), 150n);
  assert.equal(subCents(100n, 40n), 60n);
});

test('formatCents', () => {
  assert.equal(formatCents(97007n), '970.07');
});

test('parseAmount rejects garbage', () => {
  assert.throws(() => parseAmount('abc'));
});
