import assert from 'node:assert/strict';

export function assertCronSet(actual, expected) {
  assert.equal(actual.length, expected.length, 'cron schedule count differs');
  const observed = new Set(actual);
  const required = new Set(expected);
  assert.ok(
    observed.size === required.size &&
      [...required].every((cron) => observed.has(cron)),
    'cron schedules differ'
  );
}
