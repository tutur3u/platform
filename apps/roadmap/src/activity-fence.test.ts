import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveRefresh } from './activity-fence.ts';

const hour = 3_600_000;

test('the disabled fence rejects even a fresh scheduled event', () => {
  assert.equal(reserveRefresh(false, hour, hour), null);
});

test('a durable reservation blocks duplicate delivery after restart', () => {
  const reserved = reserveRefresh(true, hour, hour);
  assert.deepEqual(reserved, { slot: 1, failures: 1 });
  assert.equal(
    reserveRefresh(true, hour, hour + 1, reserved ?? undefined),
    null
  );
  assert.equal(reserveRefresh(true, hour, 2 * hour), null);
});

test('three interrupted attempts make the schedule terminal', () => {
  let attempt = reserveRefresh(true, hour, hour);
  for (const slot of [2, 3]) {
    attempt = reserveRefresh(
      true,
      slot * hour,
      slot * hour,
      attempt ?? undefined
    );
  }
  assert.deepEqual(attempt, { slot: 3, failures: 3 });
  assert.equal(
    reserveRefresh(true, 4 * hour, 4 * hour, attempt ?? undefined),
    null
  );
  assert.deepEqual(
    reserveRefresh(true, 4 * hour, 4 * hour, { slot: 3, failures: 0 }),
    { slot: 4, failures: 1 }
  );
});
