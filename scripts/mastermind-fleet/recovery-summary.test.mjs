import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { baseFleetState } from './decision-extras.mjs';
import { fitToBudget } from './publish.mjs';
import { recoveryInput as input } from './fixture.mjs';
import {
  MAX_HOSTS,
  normalizeRecoverySummary,
  readRecoverySummary,
} from './recovery-summary.mjs';

const now = new Date('2026-11-25T08:00:00Z');

test('normalizes coverage, staleness and anonymous host slots', () => {
  const summary = normalizeRecoverySummary(input, now);
  assert.equal(summary.stale, true);
  assert.equal(summary.coverage.partial, false);
  assert.equal(summary.coverage.hostsRead, 1);
  assert.equal(summary.coverage.hostsExpected, 1);
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

test('accepts a producer clock within 60 s ahead and clamps it to now', () => {
  const ahead = (ms) =>
    new Date(now.getTime() + ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const near = normalizeRecoverySummary(
    { ...input, generatedAt: ahead(5_000) },
    now
  );
  assert.equal(near.generatedAt, now.toISOString());
  assert.equal(near.stale, false);
  assert.equal(near.coverage.hosts[0].readAt, now.toISOString());
  assert.ok(
    normalizeRecoverySummary({ ...input, generatedAt: ahead(60_000) }, now)
  );
  // One millisecond past the allowance is rejected.
  assert.equal(
    normalizeRecoverySummary(
      {
        ...input,
        generatedAt: new Date(now.getTime() + 60_001).toISOString(),
      },
      now
    ),
    undefined
  );
  for (const ms of [61_000, 3_600_000, 86_400_000])
    assert.equal(
      normalizeRecoverySummary({ ...input, generatedAt: ahead(ms) }, now),
      undefined
    );
});

function withHosts(names, partial = false) {
  return {
    ...input,
    by_host: { [names[0]]: 1 },
    coverage: {
      hosts_read: names.slice(0, 1),
      hosts_without_unsettled: names.slice(1),
      partial,
    },
  };
}

test('derives the host list from the data rather than a fixed count', () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `host${i}`);
  const seven = normalizeRecoverySummary(withHosts(names(7)), now);
  assert.equal(seven.coverage.hostsRead, 7);
  assert.equal(seven.coverage.hostsExpected, 7);
  assert.equal(seven.coverage.partial, false);
  assert.equal(seven.coverage.hosts.at(-1).id, 'host-7');
  const one = normalizeRecoverySummary(withHosts(names(1)), now);
  assert.equal(one.coverage.partial, false);
  const flagged = normalizeRecoverySummary(withHosts(names(2), true), now);
  assert.equal(flagged.coverage.partial, true);
  assert.ok(normalizeRecoverySummary(withHosts(names(MAX_HOSTS)), now));
  assert.equal(
    normalizeRecoverySummary(withHosts(names(MAX_HOSTS + 1)), now),
    undefined
  );
  assert.equal(normalizeRecoverySummary(withHosts(['a', 'a']), now), undefined);
  assert.equal(
    normalizeRecoverySummary(
      {
        ...input,
        coverage: {
          hosts_read: [],
          hosts_without_unsettled: [],
          partial: false,
        },
        by_host: {},
        total_unsettled_failed_or_interrupted: 0,
      },
      now
    ),
    undefined
  );
});

test('still rejects a by_host sum that differs from the total', () => {
  assert.equal(
    normalizeRecoverySummary({ ...input, by_host: { m4: 2 } }, now),
    undefined
  );
});

test('maps the legacy dated next-action key to the stable one', () => {
  const legacy = 'resume_after_weekly_reset_2026-12-01T06:00+07:00_or_topup';
  const summary = normalizeRecoverySummary(
    { ...input, by_next_action: { [legacy]: 1 } },
    now
  );
  assert.deepEqual(summary.byNextAction, { wait_for_weekly_reset_or_topup: 1 });
  assert.equal(
    normalizeRecoverySummary(
      {
        ...input,
        by_next_action: { [legacy]: 1, wait_for_weekly_reset_or_topup: 0 },
      },
      now
    ),
    undefined
  );
});

function summaryFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-summary-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'summary.json') };
}

function warnings(t) {
  return t.mock.method(console, 'warn', () => {});
}

test('reads a private regular summary file', (t) => {
  const { file } = summaryFile(t);
  const warn = warnings(t);
  fs.writeFileSync(file, JSON.stringify(input), { mode: 0o600 });
  assert.equal(readRecoverySummary(file, now).total, 1);
  assert.equal(warn.mock.callCount(), 0);
});

test('a missing file is silent and an unset path reads nothing', (t) => {
  const { dir } = summaryFile(t);
  const warn = warnings(t);
  assert.equal(
    readRecoverySummary(path.join(dir, 'absent.json'), now),
    undefined
  );
  assert.equal(readRecoverySummary(undefined, now), undefined);
  assert.equal(warn.mock.callCount(), 0);
});

test('warns and drops a file with the wrong mode, a symlink, an oversize or invalid file', (t) => {
  const { dir, file } = summaryFile(t);
  const warn = warnings(t);
  const body = JSON.stringify(input);
  fs.writeFileSync(file, body, { mode: 0o600 });
  fs.chmodSync(file, 0o644);
  assert.equal(readRecoverySummary(file, now), undefined);
  fs.chmodSync(file, 0o600);
  const link = path.join(dir, 'link.json');
  fs.symlinkSync(file, link);
  assert.equal(readRecoverySummary(link, now), undefined);
  const big = path.join(dir, 'big.json');
  fs.writeFileSync(
    big,
    JSON.stringify({ ...input, recovery_gap: 'x'.repeat(5000) }),
    {
      mode: 0o600,
    }
  );
  assert.equal(readRecoverySummary(big, now), undefined);
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{not json', { mode: 0o600 });
  assert.equal(readRecoverySummary(bad, now), undefined);
  assert.equal(warn.mock.callCount(), 4);
  assert.equal(
    warn.mock.calls[0].arguments[0],
    'fleet recovery summaries dropped: 1'
  );
});
