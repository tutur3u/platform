const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ACCEPTED_FINDINGS, allowFinding } = require('./security-daily-secrets');
const file = 'apps/web/e2e/helpers/environment.ts';
const demoLine = fs
  .readFileSync(path.resolve(__dirname, '../../', file), 'utf8')
  .split('\n')[9];
const finding = {
  File: file,
  StartLine: 10,
  EndLine: 10,
  Commit: 'a'.repeat(40),
  RuleID: 'jwt',
};
test('allows exactly the two public demo JWT source locations', () => {
  assert.equal(
    allowFinding(finding, () => demoLine),
    true
  );
  assert.equal(
    allowFinding(
      {
        ...finding,
        File: 'scripts/e2e-local-environment.js',
        StartLine: 13,
        EndLine: 13,
      },
      () => demoLine
    ),
    true
  );
});
test('rejects a different line, path, rule or historical source content', () => {
  for (const changed of [
    { File: 'other.ts' },
    { StartLine: 11, EndLine: 11 },
    { EndLine: 12 },
    { RuleID: 'private-key' },
    { Commit: 'not-a-sha' },
  ])
    assert.equal(
      allowFinding({ ...finding, ...changed }, () => demoLine),
      false
    );
  assert.equal(
    allowFinding(finding, () => 'synthetic-other-value'),
    false
  );
});
test('every accepted finding records a rule, digest and reason', () => {
  for (const entry of ACCEPTED_FINDINGS) {
    assert.match(entry.rule, /^[a-z-]+$/);
    assert.match(entry.digest, /^[0-9a-f]{64}$/);
    assert.ok(entry.reason.length > 10);
  }
});
test('allows the synthetic SDK session token only under its own rule', () => {
  const sdkFile = 'packages/sdk/src/cli/upskii/product-commands.test.ts';
  const sdkLine = fs
    .readFileSync(path.resolve(__dirname, '../../', sdkFile), 'utf8')
    .split('\n')[433];
  const sdkFinding = {
    File: sdkFile,
    StartLine: 434,
    EndLine: 434,
    Commit: 'b'.repeat(40),
    RuleID: 'generic-api-key',
  };
  assert.equal(
    allowFinding(sdkFinding, () => sdkLine),
    true
  );
  assert.equal(
    allowFinding({ ...sdkFinding, RuleID: 'jwt' }, () => sdkLine),
    false
  );
  assert.equal(
    allowFinding(sdkFinding, () => `${sdkLine} `),
    false
  );
  assert.equal(
    allowFinding({ ...finding, RuleID: 'generic-api-key' }, () => demoLine),
    false
  );
});
test('a missing blob cannot suppress a finding', () => {
  assert.equal(
    allowFinding(finding, () => {
      throw new Error('missing blob');
    }),
    false
  );
});
