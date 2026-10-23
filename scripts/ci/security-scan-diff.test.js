// The trusted scan differ. security-checks.yaml loads this file from the pull
// request's base commit, so it must be on main before the dependency audit
// can tell new advisories from pre-existing ones.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  main,
  newBlockingAdvisories,
  redactGitleaks,
} = require('./security-scan-diff.js');

const advisory = (url, severity) => ({
  id: 1,
  severity,
  title: 'synthetic advisory',
  url,
  vulnerable_versions: '<1',
});

test('only new high/critical advisories block', () => {
  const base = { 'pkg-old': [advisory('https://x.invalid/GHSA-old', 'high')] };
  const head = {
    'pkg-new': [
      advisory('https://x.invalid/GHSA-new', 'critical'),
      advisory('https://x.invalid/GHSA-mod', 'moderate'),
    ],
    'pkg-old': [advisory('https://x.invalid/GHSA-old', 'high')],
  };
  assert.deepEqual(
    newBlockingAdvisories(head, base).map(({ advisory: id }) => id),
    ['GHSA-new']
  );
  // Pre-existing advisories never block; without a base every one counts.
  assert.deepEqual(newBlockingAdvisories(base, base), []);
  assert.equal(newBlockingAdvisories(head, {}).length, 2);
});

test('the audit diff logs counts only and fails closed on new advisories', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-diff-'));
  t.after(() => {
    fs.rmSync(dir, { force: true, recursive: true });
    process.exitCode = undefined;
  });
  const head = path.join(dir, 'head.json');
  const base = path.join(dir, 'base.json');
  fs.writeFileSync(
    head,
    JSON.stringify({
      'pkg-new': [advisory('https://x.invalid/GHSA-new', 'critical')],
    })
  );
  fs.writeFileSync(base, '{}');
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  main(['bun-audit-diff', head, base]);
  assert.equal(process.exitCode, 1);
  const output = lines.join('\n');
  assert.match(
    output,
    /1 new high\/critical dependency advisory\(ies\) \(1 critical, 0 high\)/u
  );
  assert.doesNotMatch(output, /pkg-new|GHSA-new/u);

  process.exitCode = undefined;
  lines.length = 0;
  main(['bun-audit-diff', head, head]);
  assert.equal(process.exitCode, undefined);
  assert.match(lines.join('\n'), /^0 new high\/critical/mu);
});

test('gitleaks findings never keep secret material', () => {
  const report = [
    {
      Commit: 'a'.repeat(40),
      File: 'config/x.txt',
      Fingerprint: 'fp-1',
      Match: 'synthetic-match',
      RuleID: 'synthetic-rule',
      Secret: 'synthetic-secret-value',
      StartLine: 3,
    },
  ];
  const pr = redactGitleaks(report);
  assert.deepEqual(Object.keys(pr[0]).sort(), [
    'commit',
    'file',
    'id',
    'line',
    'rule',
  ]);
  assert.doesNotMatch(JSON.stringify(pr), /synthetic-(secret|match)/u);
  // The register (public artifact) keeps no locations at all.
  assert.deepEqual(
    Object.keys(redactGitleaks(report, { locations: false })[0]).sort(),
    ['id', 'rule']
  );
});
