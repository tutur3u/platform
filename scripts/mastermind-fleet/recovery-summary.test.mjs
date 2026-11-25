import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseFleetState } from './decision-extras.mjs';
import { fitToBudget } from './publish.mjs';
import { recoveryInput as input } from './fixture.mjs';
import { normalizeRecoverySummary } from './recovery-summary.mjs';

const now = new Date('2026-11-25T08:00:00Z');

test('normalizes coverage, staleness and anonymous host slots', () => {
  const summary = normalizeRecoverySummary(input, now);
  assert.equal(summary.stale, true);
  assert.equal(summary.coverage.partial, true);
  assert.equal(summary.coverage.hostsRead, 1);
  assert.deepEqual(summary.coverage.hosts[0], {
    id: 'host-1',
    ok: true,
    readAt: '2026-11-25T05:00:00.000Z',
  });
  assert.equal(JSON.stringify(summary).includes('m4'), false);
});

test('rejects an unknown count key and a mismatched total', () => {
  assert.equal(
    normalizeRecoverySummary({ ...input, by_status: { unknown: 1 } }, now),
    undefined
  );
  assert.equal(
    normalizeRecoverySummary({ ...input, by_status: { failed: 2 } }, now),
    undefined
  );
});

test('trims recovery before lanes and removes additions from v1 fallback', () => {
  const base = { lanes: [], decisions: [], orchestrator: { state: 'idle' } };
  const recovery = normalizeRecoverySummary(input, now);
  assert.deepEqual(
    baseFleetState({
      ...base,
      recovery,
      orchestrator: {
        ...base.orchestrator,
        delegated: { running: 1, waiting: 0 },
      },
    }),
    base
  );
  assert.deepEqual(
    fitToBudget({ ...base, recovery }, Buffer.byteLength(JSON.stringify(base)))
      .state,
    base
  );
});
