// The trusted CodeQL new-alert gate. codeql.yml reads this script from the
// pull request's base commit (HEAD^1 of the merge ref), so it must be on main
// before the CodeQL workflow can tell new findings from pre-existing ones.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  findings,
  highSeverity,
  main,
  newHighFindings,
} = require('./codeql-new-alerts.js');
const severityCases = require('./fixtures/codeql-severity-cases.js');

const rules = [
  { id: 'py/high', properties: { 'security-severity': '8.1' } },
  { id: 'py/critical', properties: { 'security-severity': '9.8' } },
  { id: 'py/medium', properties: { 'security-severity': '5.0' } },
];
const result = (ruleId, hash, uri = 'pkg/a.py') => ({
  locations: [
    {
      physicalLocation: {
        artifactLocation: { uri },
        region: { startLine: 3 },
      },
    },
  ],
  message: { text: `exploit detail ${hash}` },
  partialFingerprints: { primaryLocationLineHash: hash },
  ruleId,
});
const sarif = (results) => ({
  runs: [{ results, tool: { driver: { rules } } }],
});

test('only high/critical results absent from the baseline are new', () => {
  const base = sarif([result('py/high', 'h1'), result('py/medium', 'h2')]);
  const head = sarif([
    result('py/high', 'h1'),
    result('py/medium', 'h9'),
    result('py/critical', 'h3', 'pkg/new.py'),
    result('py/high', 'h4'),
  ]);
  assert.deepEqual(
    newHighFindings(head, base).map(({ ruleId, uri }) => `${ruleId}@${uri}`),
    ['py/critical@pkg/new.py', 'py/high@pkg/a.py']
  );
  assert.deepEqual(newHighFindings(base, base), []);
  // Without a baseline every high/critical result counts as new.
  assert.equal(newHighFindings(head, { runs: [] }).length, 3);
});

test('rules with unreadable severities count as high', () => {
  const shared = JSON.parse(fs.readFileSync(severityCases.fixture, 'utf8'));
  const actual = Object.fromEntries(
    findings(shared).map(({ ruleId, severity }) => [
      ruleId,
      severity >= highSeverity,
    ])
  );
  assert.deepEqual(actual, severityCases.blocking);
});

function harness(t, { analyses, baseline, head }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-new-alerts-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.writeFileSync(
    path.join(dir, 'python.sarif'),
    JSON.stringify(
      head ?? sarif([result('py/high', 'h1'), result('py/critical', 'h3')])
    )
  );
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
  const requests = [];
  t.mock.method(global, 'fetch', async (url) => {
    requests.push(String(url));
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    return {
      json: async () =>
        String(url).includes('/analyses?')
          ? (analyses[page - 1] ?? [])
          : baseline,
      ok: true,
      status: 200,
    };
  });
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(String(line)));
  t.mock.method(console, 'error', (line) => lines.push(String(line)));
  return {
    dir,
    output: () => lines.join('\n'),
    requests,
  };
}

const filler = (count) =>
  Array.from({ length: count }, (_, index) => ({
    category: '/language:javascript-typescript',
    id: 1000 + index,
  }));

test('a baseline buried behind other categories is still found', async (t) => {
  // Frequent categories (one per main push) list first; page until found.
  const run = harness(t, {
    analyses: [
      filler(100),
      [...filler(20), { category: '/language:python', id: 7 }],
    ],
    baseline: sarif([result('py/high', 'h1'), result('py/critical', 'h3')]),
  });
  await main([run.dir, '/language:python']);
  assert.equal(process.exitCode, undefined, run.output());
  assert.ok(run.requests.some((url) => url.endsWith('/analyses/7')));
});

test('a missing baseline fails closed and identifies every blocking result', async (t) => {
  const run = harness(t, { analyses: [filler(30)], baseline: { runs: [] } });
  await main([run.dir, '/language:python']);
  assert.equal(process.exitCode, 1);
  const output = run.output();
  assert.match(
    output,
    /2 new high\/critical CodeQL result\(s\) \(1 critical, 1 high\)/u
  );
  assert.match(output, /::error::CodeQL high result: py\/high at pkg\/a.py:3/u);
  assert.match(
    output,
    /::error::CodeQL critical result: py\/critical at pkg\/a.py:3/u
  );
  assert.doesNotMatch(output, /exploit detail/u);
});

test('diagnostics identify only new results and escape workflow commands', async (t) => {
  const unsafe = result(
    'py/high\r\n::notice::forged%0A',
    'new',
    'pkg/%file\n::warning::forged.py'
  );
  const run = harness(t, {
    analyses: [[{ category: '/language:python', id: 7 }]],
    baseline: sarif([result('py/high', 'known')]),
    head: sarif([result('py/high', 'known'), unsafe]),
  });
  await main([run.dir, '/language:python']);
  assert.equal(process.exitCode, 1);
  const output = run.output();
  assert.match(
    output,
    /::error::CodeQL critical result: py\/high%0D%0A::notice::forged%250A at pkg\/%25file%0A::warning::forged.py:3/u
  );
  assert.equal(
    output.split('\n').filter((line) => line.startsWith('::error::CodeQL '))
      .length,
    1
  );
  assert.doesNotMatch(output, /\n::(?:notice|warning)::/u);
  assert.doesNotMatch(output, /CodeQL high result: py\/high at pkg\/a.py/u);
});

test('a blocking result without a location is still identified', async (t) => {
  const run = harness(t, {
    analyses: [[{ category: '/language:python', id: 7 }]],
    baseline: sarif([]),
    head: sarif([{ ruleId: 'py/high', message: { text: 'private detail' } }]),
  });
  await main([run.dir, '/language:python']);
  assert.equal(process.exitCode, 1);
  assert.match(
    run.output(),
    /CodeQL high result: py\/high at unknown location/u
  );
  assert.doesNotMatch(run.output(), /private detail/u);
});

test('baseline paging is bounded', async (t) => {
  const run = harness(t, {
    analyses: Array.from({ length: 20 }, () => filler(100)),
    baseline: { runs: [] },
  });
  await main([run.dir, '/language:python']);
  assert.equal(process.exitCode, 1);
  assert.equal(
    run.requests.filter((url) => url.includes('/analyses?')).length,
    10
  );
});

test('missing, malformed or empty CodeQL output never passes', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  for (const [label, files] of [
    ['empty directory', {}],
    ['non-sarif only', { 'python.json': '{"runs":[]}', 'notes.txt': 'x' }],
    ['malformed sarif', { 'python.sarif': '{"runs": [' }],
    ['sarif without runs', { 'python.sarif': '{}' }],
    ['sarif with empty runs', { 'python.sarif': '{"runs":[]}' }],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-output-'));
    t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    await assert.rejects(
      main([dir, '/language:python']),
      /CodeQL output unavailable/u,
      label
    );
  }
  await assert.rejects(
    main([path.join(os.tmpdir(), 'codeql-missing-dir-x'), '/language:python']),
    /CodeQL output unavailable/u
  );
});
