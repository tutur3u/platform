const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { isDocumentation, requiresCode } = require('./test-docs-only-gate');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const { evaluateExpression } = require('./github-expression-test-helper');

const docs = [
  'README.md',
  'docs/guide.mdx',
  'apps/docs/page.mdx',
  'plugins/tuturuuu/skills/example/SKILL.md',
];
const code = [
  'apps/web/src/help.md',
  'packages/ui/README.md',
  'apps/docs/docs.json',
  'apps/docs/generator.js',
  'apps/docs/logo.svg',
  '.github/workflows/turbo-unit-tests.yaml',
  'bun.lock',
  'package.json',
  'scripts/ci/test-docs-only-gate.js',
  'unknown',
  'docs/UPPERCASE.MD',
];

test('only explicitly inert prose is documentation', () => {
  for (const file of docs) assert.equal(isDocumentation(file), true, file);
  for (const file of code) assert.equal(isDocumentation(file), false, file);
});

test('complete PR diff handles mixed changes, renames, deletes and base advancement', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-docs-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (file, value = file) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  git('init', '-q');
  git('config', 'user.name', 'CI Fixture');
  git('config', 'user.email', 'fixture@example.test');
  write('apps/web/source.js');
  write('README.md');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  const base = git('rev-parse', 'HEAD');
  const commit = () => {
    git('add', '-A');
    git('commit', '-qm', 'change');
    return git('rev-parse', 'HEAD');
  };
  const needsCode = (head, baseSha = base) =>
    requiresCode({
      root,
      eventName: 'pull_request',
      event: { pull_request: { base: { sha: baseSha }, head: { sha: head } } },
    });
  assert.equal(needsCode(base), true, 'empty range retains validation');
  write('apps/docs/one.mdx');
  const docsHead = commit();
  assert.equal(needsCode(docsHead), false);
  git('checkout', '-qb', 'base-advance', base);
  write('apps/web/unrelated.js');
  const advancedBase = commit();
  assert.equal(
    needsCode(docsHead, advancedBase),
    false,
    'base-only code is outside PR diff'
  );
  git('checkout', '--detach', docsHead);
  for (const file of code) {
    write(file);
    const head = commit();
    assert.equal(needsCode(head, docsHead), true, file);
    git('checkout', '--detach', docsHead);
  }
  git('mv', 'apps/web/source.js', 'apps/docs/moved.md');
  assert.equal(needsCode(commit()), true, 'rename cannot hide removed source');
  git('checkout', '--detach', docsHead);
  git('rm', 'apps/web/source.js');
  assert.equal(needsCode(commit()), true, 'deleted source retains tests');
  git('checkout', '--detach', docsHead);
  git('rm', 'README.md');
  assert.equal(needsCode(commit()), false, 'deleted prose is docs-only');
  assert.equal(
    needsCode('a'.repeat(40)),
    true,
    'unavailable commit retains tests'
  );
});

test('pushes, malformed events, missing history and unreadable payloads retain tests', (t) => {
  for (const eventName of ['push', 'workflow_dispatch', undefined]) {
    assert.equal(requiresCode({ eventName, event: {} }), true);
  }
  for (const event of [
    {},
    { pull_request: { base: { sha: '--bad' }, head: { sha: 'a'.repeat(40) } } },
  ]) {
    assert.equal(requiresCode({ eventName: 'pull_request', event }), true);
  }
  const output = path.join(os.tmpdir(), `docs-gate-output-${process.pid}`);
  t.after(() => fs.rmSync(output, { force: true }));
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'test-docs-only-gate.js')],
    {
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: '/missing/event.json',
        GITHUB_OUTPUT: output,
      },
    }
  );
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(output, 'utf8'), 'code=true\n');
});

const workflow = readWorkflow('turbo-unit-tests.yaml', { raw: true });
const scope = (codeOutput, results = {}) => ({
  github: {
    event_name: 'pull_request',
    event: { pull_request: { labels: [{ name: 'ready-for-ci' }] } },
  },
  needs: {
    changes: { result: 'success', outputs: { code: codeOutput } },
    'check-ci': {
      result: 'success',
      outputs: { should_run: 'true', run_checks: 'true' },
    },
    'coverage-check-ci': {
      result: 'success',
      outputs: { should_run: 'true', run_checks: 'true' },
    },
    'test-shards': { result: codeOutput === 'false' ? 'skipped' : 'success' },
    ...results,
  },
  cancelled: () => false,
});

test('heavy jobs skip docs-only PRs while code, admission and summary contexts stay intact', () => {
  assert.equal(workflow.on.pull_request.paths, undefined);
  assert.equal(workflow.on.pull_request['paths-ignore'], undefined);
  assert.deepEqual(workflow.on.push.branches, [
    'main',
    'production',
    'release-please--branches--**',
  ]);
  for (const id of [
    'root-script-tests',
    'test-shards',
    'coverage-shards',
    'coverage-upload',
  ]) {
    const job = workflow.jobs[id];
    assert.ok(job.needs.includes('changes'));
    assert.equal(evaluateExpression(job.if, scope('false')), false, id);
    assert.equal(evaluateExpression(job.if, scope('true')), true, id);
    const unadmitted = scope('true');
    unadmitted.github.event.pull_request.labels = [];
    assert.equal(evaluateExpression(job.if, unadmitted), false, id);
  }
  for (const [id, name] of [
    ['build', 'Unit Tests (24)'],
    ['coverage-result', 'Run tests and collect coverage'],
  ]) {
    const job = workflow.jobs[id];
    assert.equal(job.name, name);
    assert.ok(job.needs.includes('changes'));
    assert.equal(evaluateExpression(job.if, scope('false')), true, id);
    const noop = job.steps.find((step) =>
      step.name.startsWith('Documentation-only')
    );
    assert.equal(evaluateExpression(noop.if, scope('false')), true);
    assert.equal(evaluateExpression(noop.if, scope('true')), false);
    const required = job.steps.find((step) => step.env?.TEST_RESULT);
    assert.equal(evaluateExpression(required.if, scope('false')), false);
    assert.equal(evaluateExpression(required.if, scope('true')), true);
    const env = {
      ...process.env,
      TEST_RESULT: 'success',
      ROOT_SCRIPT_RESULT: 'success',
      UPLOAD_RESULT: 'success',
      COVERAGE_RESULT: 'success',
      RUST_QUALIFICATION_REQUIRED: 'false',
    };
    assert.equal(
      spawnSync('bash', ['-e', '-c', required.run], { env }).status,
      0
    );
    for (const key of id === 'build'
      ? ['TEST_RESULT', 'ROOT_SCRIPT_RESULT']
      : ['TEST_RESULT', 'UPLOAD_RESULT', 'COVERAGE_RESULT']) {
      for (const state of ['failure', 'cancelled', 'skipped', '']) {
        assert.notEqual(
          spawnSync('bash', ['-e', '-c', required.run], {
            env: { ...env, [key]: state },
          }).status,
          0
        );
      }
    }
    const classification = job.steps.find((step) => step.env?.CHANGES_RESULT);
    for (const [result, code] of [
      ['failure', ''],
      ['success', ''],
      ['success', 'garbage'],
    ]) {
      assert.notEqual(
        spawnSync('bash', ['-e', '-c', classification.run], {
          env: { ...env, CHANGES_RESULT: result, CODE: code },
        }).status,
        0
      );
    }
    assert.equal(
      spawnSync('bash', ['-e', '-c', classification.run], {
        env: { ...env, CHANGES_RESULT: 'success', CODE: 'false' },
      }).status,
      0
    );
  }
});
