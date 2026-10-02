import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStrictTap } from './programming-database-tap.mjs';

test('complete sequential TAP succeeds with surrounding psql metadata', () => {
  assertStrictTap('BEGIN\nok 1 - first\nok 2 - second\n1..2\nROLLBACK\n');
});
for (const [name, tap] of [
  ['missing plan', 'ok 1 - first'],
  ['truncated', 'ok 1 - first\n1..2'],
  ['failed', 'not ok 1 - first\n1..1'],
  ['duplicate', 'ok 1 - first\nok 1 - first\n1..2'],
  ['skipped', 'ok 1 - first # SKIP disabled\n1..1'],
  ['todo', 'ok 1 - first # TODO later\n1..1'],
  ['empty', '1..0'],
  ['bailout', 'ok 1 - first\n1..1\nBail out! failed'],
  ['multiple plans', 'ok 1 - first\n1..1\n1..1'],
]) {
  test(`rejects ${name} TAP`, () => {
    assert.throws(() => assertStrictTap(tap), /TAP contract failed/);
  });
}
