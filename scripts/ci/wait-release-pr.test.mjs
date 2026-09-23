import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releasePrReady } from './wait-release-pr.mjs';

const now = Date.parse('2026-09-20T12:00:00Z');
const old = '2026-09-20T11:55:00Z';
const fresh = '2026-09-20T11:59:00Z';
const pr = {
  headRefOid: 'head',
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  updatedAt: old,
  statusCheckRollup: [
    { name: 'tests', status: 'COMPLETED', conclusion: 'SUCCESS' },
  ],
};
const counts = { active_unresolved: 0 };
test('requires a quiet checked generated head and no active review threads', () => {
  assert.equal(releasePrReady(pr, counts, 'head', old, now), true);
  assert.equal(
    releasePrReady(pr, counts, 'head', '2026-09-20T11:55:01Z', now),
    false
  );
  assert.equal(releasePrReady(pr, counts, 'head', fresh, now), false);
  assert.equal(
    releasePrReady({ ...pr, updatedAt: fresh }, counts, 'head', old, now),
    false
  );
  assert.equal(
    releasePrReady({ ...pr, statusCheckRollup: [] }, counts, 'head', old, now),
    false
  );
  assert.equal(
    releasePrReady(
      { ...pr, mergeable: 'CONFLICTING' },
      counts,
      'head',
      old,
      now
    ),
    false
  );
  assert.throws(
    () => releasePrReady(pr, { active_unresolved: 1 }, 'head', old, now),
    /unresolved/
  );
  assert.throws(
    () => releasePrReady(pr, counts, 'changed', old, now),
    /changed/
  );
});
