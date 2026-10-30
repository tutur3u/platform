const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const daily = readWorkflow('security-scan.yaml');
const checks = readWorkflow('security-checks.yaml');
test('daily scan has the approved schedule, read-only authority and no PR trigger', () => {
  assert.deepEqual(daily.on.schedule, [{ cron: '0 20 * * *' }]);
  assert.deepEqual(Object.keys(daily.on).sort(), [
    'schedule',
    'workflow_dispatch',
  ]);
  assert.deepEqual(daily.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(daily.jobs).sort(), [
    'definers',
    'route-permissions',
    'secrets-diff',
  ]);
  for (const job of Object.values(daily.jobs)) {
    assert.match(job.if, /github\.event\.repository\.default_branch/);
    assert.ok(job['timeout-minutes'] <= 15);
    assert.equal(job.permissions, undefined);
    for (const step of job.steps) {
      if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/);
      if (step.uses?.startsWith('actions/checkout'))
        assert.equal(step.with['persist-credentials'], false);
    }
    const upload = job.steps.find((s) =>
      s.uses?.startsWith('actions/upload-artifact')
    );
    assert.equal(upload.if, 'always()');
    assert.equal(upload.with['if-no-files-found'], 'error');
  }
  const yaml = fs.readFileSync('.github/workflows/security-scan.yaml', 'utf8');
  assert.doesNotMatch(
    yaml,
    /\$\{\{[^}]*\bsecrets\.|pull_request|sb:push|vercel|git push|npm install|bun install/
  );
});
test('daily secret scan ignores checkout suppressions and emits a sanitized artifact', () => {
  const job = daily.jobs['secrets-diff'];
  assert.equal(job.env.GITLEAKS_VERSION, checks.env.GITLEAKS_VERSION);
  assert.equal(job.env.GITLEAKS_SHA256, checks.env.GITLEAKS_SHA256);
  const install = job.steps.find(
    (s) => s.name === 'Install checksum-verified gitleaks'
  );
  assert.match(install.run, /sha256sum --check --strict/);
  const run = job.steps.find((s) => s.name.startsWith('Scan last')).run;
  assert.match(run, /detect --log-opts="--since=36\.hours" --redact/);
  assert.match(run, /--ignore-gitleaks-allow/);
  assert.match(run, /unset GITLEAKS_CONFIG GITLEAKS_CONFIG_TOML/);
  assert.match(run, /rm -f \.gitleaksignore \.gitleaks\.toml/);
  assert.match(run, /node scripts\/ci\/security-daily-secrets\.js/);
  assert.equal(
    job.steps.at(-1).with.path,
    '$' + '{{ runner.temp }}/gitleaks.json'
  );
});
test('PR guard trusts base source and baseline, never PR baseline additions', () => {
  const job = checks.jobs['definer-guard'];
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.match(job.if, /pull_request/);
  const run = job.steps.find(
    (s) => s.name === 'Load trusted definer guard and baseline'
  ).run;
  assert.match(run, /git show "\$BASE_SHA:scripts\/ci\/\$file"/);
  assert.match(run, /security-definer-baseline\.json/);
  assert.match(run, /security-sql\.js/);
  assert.match(run, /bootstrap requires independent CI\/security review/);
  assert.match(run, /node "\$dir\/security-definer-guard\.js"/);
});
