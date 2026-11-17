const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const job = readWorkflow('e2e-smoke-report-only.yaml').jobs.e2e;
const steps = job.steps;
const restore = steps.filter((step) =>
  step.uses?.startsWith('actions/cache/restore@')
);
const save = steps.filter((step) =>
  step.uses?.startsWith('actions/cache/save@')
);

test('dependency caches retain the trusted-main job admission and exact inputs', () => {
  assert.equal(
    job.if,
    "github.ref == 'refs/heads/main' && github.repository == 'tutur3u/platform'"
  );
  assert.equal(restore.length, 2);
  assert.equal(save.length, 2);
  for (const step of [...restore, ...save]) {
    assert.match(step.uses, /@55cc8345863c7cc4c66a329aec7e433d2d1c52a9$/);
    assert.equal(step.with['restore-keys'], undefined);
  }
  assert.deepEqual(
    restore.map((step) => step.with.path).sort(),
    ['~/.bun/install/cache', '~/.cache/ms-playwright'].sort()
  );
  for (const step of [...restore, ...save]) {
    assert.match(step.with.key, /runner\.os/);
    assert.match(step.with.key, /runner\.arch/);
    assert.match(step.with.key, /hashFiles\('bun\.lock'/);
    assert.doesNotMatch(step.with.key, /run_id|run_attempt|restore-keys/);
  }
  const bun = restore.find((step) => step.id === 'bun-packages');
  assert.match(bun.with.key, /1\.4\.4/);
  assert.match(
    bun.with.key,
    /'package\.json', 'apps\/\*\/package\.json', 'packages\/\*\/package\.json', 'patches\/\*\*'/
  );
  const setup = steps.find((step) =>
    step.uses?.startsWith('./.github/actions/setup-bun-with-retry')
  );
  assert.equal(setup.with['package-cache-enabled'], 'false');
  assert.equal(setup.with['bun-version'], '1.4.4');
  assert.match(
    steps.find((step) => step.name === 'Install dependencies').run,
    /bun install --frozen-lockfile/
  );
  assert.equal(
    steps.find((step) => step.name === 'Install Chromium').run,
    'bun x playwright install --with-deps chromium'
  );
});

test('only bounded cache misses from main pushes may write', () => {
  for (const step of save) {
    const evaluate = Function(
      'github',
      'outputs',
      `return ${step.if.replace(/steps\.([\w-]+)\.outputs\.([\w-]+)/g, 'outputs["$1.$2"]')}`
    );
    for (const ref of [
      'refs/heads/main',
      'refs/heads/production',
      'refs/pull/7/merge',
    ]) {
      for (const event_name of [
        'push',
        'schedule',
        'workflow_dispatch',
        'pull_request',
        'pull_request_target',
      ]) {
        for (const actor of ['contributor', 'dependabot[bot]']) {
          for (const hit of ['true', 'false']) {
            for (const bounded of ['true', 'false']) {
              const outputs = new Proxy(
                {},
                {
                  get: (_, key) => (key.endsWith('.cache-hit') ? hit : bounded),
                }
              );
              assert.equal(
                evaluate({ ref, event_name, actor }, outputs),
                ref === 'refs/heads/main' &&
                  event_name === 'push' &&
                  actor !== 'dependabot[bot]' &&
                  hit === 'false' &&
                  bounded === 'true'
              );
            }
          }
        }
      }
    }
    const id = step.with.path.includes('ms-playwright')
      ? 'chromium'
      : 'bun-packages';
    assert.equal(
      step.with.key,
      restore.find((item) => item.id === id).with.key
    );
    assert.ok(
      steps.indexOf(step) >
        steps.findIndex((item) => item.name === 'Install Chromium')
    );
  }
});

test('archive size gate fails closed on oversized or malformed measurements', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-cache-budget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'du'),
    '#!/bin/sh\nprintf "%s\\n" "$DU_KIB"\n',
    { mode: 0o700 }
  );
  const budget = steps.find((step) => step.id === 'cache-budget');
  for (const [size, expected] of [
    ['1', ['bun=true', 'chromium=true']],
    ['524289', ['bun=false', 'chromium=true']],
    ['1048577', ['bun=false', 'chromium=false']],
    ['invalid', ['bun=false', 'chromium=false']],
  ]) {
    const output = path.join(root, `output-${size}`);
    const result = spawnSync(
      'bash',
      ['-e', '-o', 'pipefail', '-c', budget.run],
      {
        env: {
          ...process.env,
          HOME: root,
          PATH: `${bin}:/usr/bin:/bin`,
          DU_KIB: size,
          GITHUB_OUTPUT: output,
        },
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      fs.readFileSync(output, 'utf8').trim().split('\n'),
      expected
    );
  }
});
