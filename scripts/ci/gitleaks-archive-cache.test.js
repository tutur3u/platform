const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflows = [
  ['security-checks.yaml', 'secrets'],
  ['security-scan.yaml', 'secrets-diff'],
];
const expression = (value) => '$' + '{{ ' + value + ' }}';

for (const [file, jobId] of workflows) {
  const workflow = readWorkflow(file, { raw: true });
  const job = workflow.jobs[jobId];
  const steps = job.steps;
  const restore = steps.find((step) => step.id === 'gitleaks-archive');
  const install = steps.find(
    (step) => step.name === 'Install checksum-verified gitleaks'
  );
  const save = steps.find(
    (step) => step.name === 'Save verified Gitleaks archive'
  );
  const pins = { ...workflow.env, ...job.env };

  test(`${file}: cache identity binds version, OS, architecture and checksum`, () => {
    assert.equal(pins.GITLEAKS_VERSION, '8.30.1');
    assert.equal(
      pins.GITLEAKS_SHA256,
      '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
    );
    assert.equal(
      restore.uses,
      'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
    );
    assert.equal(
      save.uses,
      'actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
    );
    const scope = { runner: { os: 'Linux', arch: 'X64' }, env: pins };
    const key = renderTemplate(restore.with.key, scope);
    assert.equal(
      key,
      `gitleaks-archive-v1-Linux-X64-8.30.1-${pins.GITLEAKS_SHA256}`
    );
    for (const [field, value] of [
      ['os', 'Windows'],
      ['arch', 'ARM64'],
    ]) {
      assert.notEqual(
        renderTemplate(restore.with.key, {
          ...scope,
          runner: { ...scope.runner, [field]: value },
        }),
        key
      );
    }
    for (const field of ['GITLEAKS_VERSION', 'GITLEAKS_SHA256']) {
      assert.notEqual(
        renderTemplate(restore.with.key, {
          ...scope,
          env: { ...pins, [field]: 'changed' },
        }),
        key
      );
    }
    assert.equal(
      restore.with.path,
      expression('runner.temp') + '/gitleaks-archive/gitleaks.tar.gz'
    );
    assert.equal(save.with.path, restore.with.path);
    assert.equal(save.with.key, restore.with.key);
    assert.equal(restore.with['restore-keys'], undefined);
    assert.equal(
      install.if,
      undefined,
      'verification cannot depend on cache-hit'
    );
    assert.ok(steps.indexOf(restore) < steps.indexOf(install));
    assert.equal(steps.indexOf(save), steps.indexOf(install) + 1);
  });

  test(`${file}: only a default-branch cache miss can publish the verified archive`, () => {
    function allowed(event, ref, hit = 'false') {
      return Boolean(
        evaluateExpression(save.if, {
          github: {
            event_name: event,
            ref,
            event: { repository: { default_branch: 'main' } },
          },
          steps: { 'gitleaks-archive': { outputs: { 'cache-hit': hit } } },
        })
      );
    }
    assert.equal(allowed('push', 'refs/heads/main'), true);
    assert.equal(allowed('schedule', 'refs/heads/main'), true);
    assert.equal(allowed('workflow_dispatch', 'refs/heads/main'), true);
    assert.equal(allowed('pull_request', 'refs/pull/1/merge'), false);
    assert.equal(allowed('pull_request', 'refs/heads/main'), false);
    assert.equal(allowed('push', 'refs/heads/feature'), false);
    assert.equal(allowed('workflow_dispatch', 'refs/heads/feature'), false);
    assert.equal(allowed('push', 'refs/heads/main', 'true'), false);
    assert.doesNotMatch(save.if, /always\(|failure\(|continue-on-error/);
    assert.equal(install['continue-on-error'], undefined);
  });

  for (const scenario of [
    'hit',
    'miss',
    'corrupt-hit',
    'corrupt-download',
    'network-error',
  ]) {
    test(`${file}: real bootstrap shell ${scenario}`, (t) => {
      const box = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-cache-'));
      t.after(() => fs.rmSync(box, { recursive: true, force: true }));
      const temp = path.join(box, 'temp');
      const bin = path.join(box, 'bin');
      const source = path.join(box, 'source');
      for (const dir of [temp, bin, source]) fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(source, 'gitleaks'),
        '#!/bin/sh\necho fixture-scanner\n'
      );
      const fixture = path.join(box, 'fixture.tar.gz');
      execFileSync('tar', ['-czf', fixture, '-C', source, 'gitleaks']);
      const hash = createHash('sha256')
        .update(fs.readFileSync(fixture))
        .digest('hex');
      const archive = path.join(temp, 'gitleaks-archive/gitleaks.tar.gz');
      if (scenario.endsWith('hit')) {
        fs.mkdirSync(path.dirname(archive));
        fs.writeFileSync(
          archive,
          scenario === 'hit' ? fs.readFileSync(fixture) : 'corrupt archive'
        );
      }
      const log = path.join(box, 'curl-args');
      fs.writeFileSync(
        path.join(bin, 'curl'),
        `#!/bin/sh
printf '%s\\n' "$@" > "$CURL_LOG"
if [ "$SCENARIO" = hit ] || [ "$SCENARIO" = corrupt-hit ]; then exit 97; fi
if [ "$SCENARIO" = network-error ]; then exit 22; fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then shift; output="$1"; fi
  shift
done
if [ "$SCENARIO" = corrupt-download ]; then printf corrupt > "$output"; else cp "$FIXTURE" "$output"; fi
`,
        { mode: 0o755 }
      );
      // Ubuntu executes GNU sha256sum directly. macOS uses Node's actual SHA-256
      // implementation because its sha256sum does not accept GNU long flags.
      if (process.platform === 'darwin') {
        fs.writeFileSync(
          path.join(bin, 'sha256sum'),
          `#!${process.execPath}
const fs = require('node:fs');
const { createHash } = require('node:crypto');
require('node:assert/strict').deepEqual(process.argv.slice(2), ['--check', '--strict']);
const line = fs.readFileSync(0, 'utf8').trimEnd();
const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
if (!match) process.exit(1);
const actual = createHash('sha256').update(fs.readFileSync(match[2])).digest('hex');
const ok = actual === match[1];
console.log(match[2] + (ok ? ': OK' : ': FAILED'));
process.exit(ok ? 0 : 1);
`,
          { mode: 0o755 }
        );
      }
      const result = spawnSync('bash', ['-c', install.run], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          RUNNER_TEMP: temp,
          GITLEAKS_VERSION: pins.GITLEAKS_VERSION,
          GITLEAKS_SHA256: hash,
          CURL_LOG: log,
          SCENARIO: scenario,
          FIXTURE: fixture,
        },
      });
      assert.ifError(result.error);
      assert.equal(
        result.status === 0,
        ['hit', 'miss'].includes(scenario),
        result.stderr
      );
      assert.equal(fs.existsSync(log), !scenario.endsWith('hit'));
      assert.equal(
        fs.existsSync(path.join(temp, 'gitleaks')),
        ['hit', 'miss'].includes(scenario)
      );
      if (result.status === 0) {
        assert.equal(
          fs.readFileSync(path.join(temp, 'gitleaks'), 'utf8'),
          fs.readFileSync(path.join(source, 'gitleaks'), 'utf8')
        );
        assert.match(result.stdout, /: OK/);
      }
      if (scenario.startsWith('corrupt'))
        assert.match(result.stdout + result.stderr, /FAILED|checksum/);
      if (fs.existsSync(log)) {
        const args = fs.readFileSync(log, 'utf8').trim().split('\n');
        assert.equal(
          args[args.indexOf('--retry') + 1],
          file === 'security-checks.yaml' ? '3' : '2'
        );
        assert.ok(args.includes('--fail'));
        assert.ok(
          args.includes(
            'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz'
          )
        );
        if (file === 'security-scan.yaml')
          assert.equal(args[args.indexOf('--max-time') + 1], '120');
      }
      if (scenario === 'network-error') assert.equal(result.status, 22);
    });
  }
}
