const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  findings,
  highSeverity,
  main: codeqlGate,
  newHighFindings,
} = require('./codeql-new-alerts.js');
const severityCases = require('./fixtures/codeql-severity-cases.js');
const {
  auditAdvisories,
  newBlockingAdvisories,
  redactGitleaks,
} = require('./security-scan-diff.js');

function sarif(results, rules = []) {
  return { runs: [{ results, tool: { driver: { rules } } }] };
}
const rules = [
  { id: 'js/sql-injection', properties: { 'security-severity': '8.8' } },
  { id: 'js/weak-hash', properties: { 'security-severity': '5.0' } },
  { id: 'js/code-injection', properties: { 'security-severity': '9.3' } },
];
const result = (ruleId, hash, uri = 'apps/web/src/a.ts') => ({
  locations: [
    {
      physicalLocation: { artifactLocation: { uri }, region: { startLine: 3 } },
    },
  ],
  partialFingerprints: { primaryLocationLineHash: hash },
  ruleId,
});

test('CodeQL gate fails only on high/critical results absent from the baseline', () => {
  const base = sarif(
    [result('js/sql-injection', 'h1'), result('js/weak-hash', 'h2')],
    rules
  );
  const head = sarif(
    [
      result('js/sql-injection', 'h1'),
      result('js/weak-hash', 'h9'),
      result('js/code-injection', 'h3', 'apps/web/src/new.ts'),
      result('js/sql-injection', 'h4'),
    ],
    rules
  );
  assert.deepEqual(
    newHighFindings(head, base).map(({ ruleId, uri }) => `${ruleId}@${uri}`),
    [
      'js/code-injection@apps/web/src/new.ts',
      'js/sql-injection@apps/web/src/a.ts',
    ]
  );
  // An unchanged baseline result keeps the PR passing even when it moved lines.
  assert.deepEqual(newHighFindings(base, base), []);
  // Without a baseline every high result counts as new.
  assert.equal(newHighFindings(head, { runs: [] }).length, 3);
  assert.equal(
    findings(head).find(({ ruleId }) => ruleId === 'js/weak-hash').severity,
    5
  );
});

const advisory = (url, severity) => ({
  id: 1,
  severity,
  title: 't',
  url,
  vulnerable_versions: '<1',
});

test('CodeQL rules with unreadable severities count as high', () => {
  // REV-6456-14: missing, null, empty or non-numeric security-severity (and
  // unknown rules) are high, never 0; the jq bootstrap gate shares the fixture.
  const sarif = JSON.parse(
    require('node:fs').readFileSync(severityCases.fixture, 'utf8')
  );
  const actual = Object.fromEntries(
    findings(sarif).map(({ ruleId, severity }) => [
      ruleId,
      severity >= highSeverity,
    ])
  );
  assert.deepEqual(actual, severityCases.blocking);
});

test('dependency audit fails only on new high/critical advisories', () => {
  const base = {
    braces: [advisory('https://github.com/advisories/GHSA-a', 'high')],
  };
  const head = {
    braces: [advisory('https://github.com/advisories/GHSA-a', 'high')],
    esbuild: [advisory('https://github.com/advisories/GHSA-b', 'moderate')],
    forge: [advisory('https://github.com/advisories/GHSA-c', 'critical')],
  };
  assert.deepEqual(
    newBlockingAdvisories(head, base).map(({ package: pkg }) => pkg),
    ['forge']
  );
  assert.deepEqual(newBlockingAdvisories(base, base), []);
  assert.equal(auditAdvisories(head)[0].advisory, 'GHSA-a');
});

test('gitleaks output never keeps secret material', () => {
  const report = [
    {
      Commit: '0123456789abcdef',
      File: 'apps/web/.env',
      Fingerprint: '0123:apps/web/.env:generic-api-key:4',
      Match: 'API_KEY=REDACTED',
      RuleID: 'generic-api-key',
      Secret: 'REDACTED',
      StartLine: 4,
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
  const register = redactGitleaks(report, { locations: false });
  assert.deepEqual(Object.keys(register[0]).sort(), ['id', 'rule']);
  assert.doesNotMatch(
    JSON.stringify([pr, register]),
    /REDACTED|API_KEY|Secret|Match/u
  );
  assert.equal(register[0].id, pr[0].id);
});

test('CodeQL gate logs counts only, never rule IDs, paths or messages', async (t) => {
  // The repository is public, so findings stay in code scanning.
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-gate-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const sarif = JSON.parse(fs.readFileSync(severityCases.fixture, 'utf8'));
  sarif.runs[0].results = sarif.runs[0].results.map((result, index) => ({
    ...result,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `secret/path-${index}.py` },
          region: { startLine: index + 1 },
        },
      },
    ],
    message: { text: `exploit detail ${index}` },
  }));
  fs.writeFileSync(path.join(dir, 'python.sarif'), JSON.stringify(sarif));
  const saved = { ...process.env };
  t.after(() => {
    process.env = saved;
    process.exitCode = undefined;
  });
  Object.assign(process.env, {
    BASELINE_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'example/platform',
    GITHUB_TOKEN: 'synthetic',
  });
  t.mock.method(global, 'fetch', async (url) => ({
    json: async () =>
      String(url).includes('/analyses?')
        ? [{ category: '/language:python', id: 1 }]
        : { runs: [] },
    ok: true,
    status: 200,
  }));
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  t.mock.method(console, 'error', (line) => lines.push(String(line)));
  await codeqlGate([dir, '/language:python']);
  const output = lines.join('\n');
  assert.equal(process.exitCode, 1);
  assert.match(
    output,
    /new high\/critical CodeQL result\(s\) \(\d+ critical, \d+ high\)/u
  );
  assert.doesNotMatch(output, /js\/|secret\/path|exploit detail|file=/u);
});
