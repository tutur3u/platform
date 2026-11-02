import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertCronSet } from './assert-cron-set.mjs';

const { identity } = JSON.parse(
  readFileSync(
    new URL(
      '../../../scripts/ci/fixtures/cf-worker-parity/cron-control.json',
      import.meta.url
    ),
    'utf8'
  )
);
const expected = identity.crons;

test('all nine configured crons pass when reordered', () => {
  assert.equal(expected.length, 9);
  assertCronSet([...expected].reverse(), expected);
});

for (const [label, actual] of [
  ['missing', expected.slice(1)],
  ['extra', [...expected, '1 * * * *']],
  ['different', ['1 * * * *', ...expected.slice(1)]],
  ['duplicate replacing a required cron', [...expected.slice(1), expected[1]]],
  ['extra duplicate', [...expected, expected[0]]],
]) {
  test(`${label} cron fails exact set and count verification`, () => {
    assert.throws(() => assertCronSet(actual, expected), /cron schedule/);
  });
}
