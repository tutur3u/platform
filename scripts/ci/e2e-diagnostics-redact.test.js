const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { redactText, sanitize } = require('./e2e-diagnostics-redact');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('quoted JSON and plaintext credentials are redacted without leaking values', () => {
  const inputs = [
    'log {"access_token":"fixture-access", "refresh_token": "fixture-refresh", "sessionToken":"fixture-session"}',
    'PASSWORD=fixture-password',
    'Set-Cookie: arbitrary=fixture-cookie; another=fixture-other\nContent-Type: text/plain',
    'Cookie: arbitrary=fixture-cookie; another=fixture-other',
    'Authorization: Bearer fixture-header',
    'https://example.test/?code=fixture-code&access_token=fixture-query',
  ];
  for (const input of inputs)
    assert.doesNotMatch(redactText(input, {}), /fixture-/u);
  const json = JSON.parse(
    sanitize(
      JSON.stringify({
        access_token: 'fixture-token',
        nested: { refreshToken: 'fixture-refresh' },
        headers: [{ name: 'Authorization', value: 'fixture-header' }],
        note: 'fixture-env-value',
        status: 'failed',
      }),
      { TEST_SECRET: 'fixture-env-value' }
    )
  );
  assert.equal(json.status, 'failed');
  assert.doesNotMatch(JSON.stringify(json), /fixture-/u);
});

test('report sanitization writes only safe text to the uploaded diagnostics directory', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-diagnostics-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'raw.json'),
    JSON.stringify({ stats: { unexpected: 1 }, session: 'fixture-secret' })
  );
  execFileSync(
    process.execPath,
    [
      require.resolve('./e2e-diagnostics-redact'),
      '--report',
      'raw.json',
      '--output',
      'tmp/e2e-diagnostics/report.json',
    ],
    { cwd: dir }
  );
  const output = fs.readFileSync(
    path.join(dir, 'tmp/e2e-diagnostics/report.json'),
    'utf8'
  );
  assert.doesNotMatch(output, /fixture-secret/u);
  assert.equal(JSON.parse(output).stats.unexpected, 1);
});

test('all live failure uploads require sanitized text and exclude raw traces/reports', () => {
  const workflow = readWorkflow('e2e-tests.yaml');
  for (const id of ['e2e', 'inventory-storefront-cache-e2e']) {
    const upload = workflow.jobs[id].steps.find((step) =>
      step.uses?.startsWith('actions/upload-artifact')
    );
    assert.equal(upload.with.path, 'tmp/e2e-diagnostics/');
    assert.match(upload.if, /outcome == 'success'/u);
  }
  const collector = fs.readFileSync(
    path.join(__dirname, 'e2e-diagnostics.sh'),
    'utf8'
  );
  assert.ok(
    collector.indexOf('node scripts/ci/e2e-diagnostics-redact.js') <
      collector.indexOf('echo "::group::')
  );
});

test('unstructured credential header records and collections cannot leak later values', () => {
  for (const input of [
    'request headers: [{"name":"Authorization","value":"Bearer fixture-private"}]',
    "request headers: [{ name: 'Cookie', value: 'opaque=fixture-private' }]",
    "headers: { value: 'fixture-private', name: 'Authorization' }",
    "headers: { name: 'Cookie',\n value: 'fixture-private' }",
    'TOKEN=["fixture-first","fixture-second"]',
    'SESSION={first:"fixture-first",second:"fixture-second"}',
  ])
    assert.doesNotMatch(sanitize(input, {}), /fixture-/u);
});

test('symlinked diagnostics root or parent blocks output before writing', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-diagnostics-links-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const parent of [true, false]) {
    const cwd = path.join(dir, parent ? 'parent' : 'root');
    const target = path.join(dir, parent ? 'parent-target' : 'root-target');
    fs.mkdirSync(cwd);
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(cwd, 'raw.json'), '{"status":"failed"}');
    if (!parent) fs.mkdirSync(path.join(cwd, 'tmp'));
    fs.symlinkSync(
      target,
      path.join(cwd, parent ? 'tmp' : 'tmp/e2e-diagnostics')
    );
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [
          require.resolve('./e2e-diagnostics-redact'),
          '--report',
          'raw.json',
          '--output',
          'tmp/e2e-diagnostics/report.json',
        ],
        { cwd, stdio: 'pipe' }
      )
    );
    assert.deepEqual(fs.readdirSync(target), []);
  }
});
