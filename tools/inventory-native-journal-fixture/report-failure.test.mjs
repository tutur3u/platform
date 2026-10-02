import assert from 'node:assert/strict';
import test from 'node:test';
import { isMatchingReportFailure } from './report-failure.mjs';

test('failure diagnostics require exact identity and a fresh native process', () => {
  const expected = {
    run_id: '1-1-android',
    source_sha: 'a'.repeat(40),
    journal_sha256: 'b'.repeat(64),
  };
  const marker = {
    ...expected,
    phase: 'read',
    passed: false,
    error: 'report_failed',
    process_id: 2,
  };
  assert.equal(isMatchingReportFailure(marker, expected, 'read', [1]), true);
  for (const change of [
    { passed: true },
    { phase: 'write' },
    { run_id: '2-1-android' },
    { source_sha: 'c'.repeat(40) },
    { journal_sha256: 'd'.repeat(64) },
    { error: 'RAW_SECRET' },
    { process_id: 1 },
    { process_id: 0 },
    { process_id: null },
    { process_id: 1.5 },
  ])
    assert.equal(
      isMatchingReportFailure({ ...marker, ...change }, expected, 'read', [1]),
      false
    );
  assert.equal(isMatchingReportFailure(null, expected, 'read', [1]), false);
});
