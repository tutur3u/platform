const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { evaluateExpression } = require('./github-expression-test-helper');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const repoRoot = path.resolve(__dirname, '../..');
const workflows = readAllWorkflows(undefined, { raw: true });
const gated = Object.entries(workflows).filter(([, workflow]) =>
  Object.hasOwn(workflow.jobs ?? {}, 'affected-gate')
);
const needsOf = (job) => [job.needs ?? []].flat();

const scopedCallers = {
  'git-cloudflare.yaml': { app: 'git', jobs: ['build'] },
  'external-cloudflare.yaml': { app: 'external', jobs: ['build'] },
  'roadmap-cloudflare.yaml': { app: 'roadmap', jobs: ['build'] },
  'rewise-cloudflare.yaml': { app: 'rewise', jobs: ['cutover-artifact'] },
  'meet-cloudflare.yaml': {
    app: 'meet',
    jobs: ['validate', 'restored-artifact'],
  },
  'web-start-candidate.yaml': { app: 'web', jobs: ['candidate'] },
  'contacts-start-candidate.yaml': { app: 'contacts', jobs: ['candidate'] },
};

const admittedPrContext = (run) => ({
  github: {
    event_name: 'pull_request',
    ref: 'refs/pull/1/merge',
    repository: 'tutur3u/platform',
    event: {
      pull_request: {
        draft: false,
        labels: [{ name: 'ready-for-ci' }],
        head: { repo: { full_name: 'tutur3u/platform' } },
      },
    },
  },
  needs: {
    'affected-gate': { result: 'success', outputs: { run } },
    'check-ci': {
      result: 'success',
      outputs: { should_run: 'true', run_checks: 'true' },
    },
    'production-policy': { result: 'skipped', outputs: { allowed: 'false' } },
    validate: { result: 'success' },
  },
});

for (const [file, { app, jobs }] of Object.entries(scopedCallers)) {
  test(`${file}: app qualification skips unrelated changes and runs affected changes`, async () => {
    const { decide } = await import('./affected-gate.mjs');
    const workflow = workflows[file];
    const qualify = (apps) =>
      String(
        decide({
          eventName: 'pull_request',
          apps: app,
          result: { mode: 'affected', apps, reason: 'test dependency closure' },
        }).run
      );
    for (const id of jobs) {
      const condition = workflow.jobs[id].if;
      assert.equal(
        evaluateExpression(
          condition,
          admittedPrContext(qualify(['apps/docs']))
        ),
        false,
        `${id}: unrelated changes must skip`
      );
      const context = admittedPrContext(qualify([`apps/${app}`]));
      assert.equal(
        evaluateExpression(condition, context),
        true,
        `${id}: affected app must run`
      );
      context.github.event.pull_request.labels = [];
      assert.equal(
        evaluateExpression(condition, context),
        false,
        `${id}: readiness remains required`
      );
    }
    assert.equal(workflow.jobs['affected-gate']?.steps[1].with.app, app);
  });
}

test('manual and production-only jobs retain their event and ref boundaries', () => {
  const dispatch = admittedPrContext('true');
  dispatch.github.event_name = 'workflow_dispatch';
  const rewise = workflows['rewise-cloudflare.yaml'].jobs.native.if;
  assert.equal(evaluateExpression(rewise, dispatch), true);
  assert.equal(evaluateExpression(rewise, admittedPrContext('true')), false);

  const production = admittedPrContext('true');
  production.github.event_name = 'push';
  production.github.ref = 'refs/heads/production';
  const meet = workflows['meet-cloudflare.yaml'].jobs['production-policy'].if;
  assert.equal(evaluateExpression(meet, production), true);
  assert.equal(evaluateExpression(meet, admittedPrContext('true')), false);
});

test('affected-gate is wired into per-app workflows', () => {
  assert.ok(gated.length > 0, 'expected affected-gate workflows');
});

for (const [file, workflow] of gated) {
  test(`${file}: affected-gate is a fail-open, read-only first job`, () => {
    const gate = workflow.jobs['affected-gate'];
    assert.equal(Object.keys(workflow.jobs)[0], 'affected-gate');
    assert.equal(gate['runs-on'], 'ubuntu-latest');
    assert.deepEqual(gate.permissions, { contents: 'read' });
    assert.equal(gate['timeout-minutes'], 5);
    assert.equal(gate.needs, undefined);
    // Step failures must never fail the job; run defaults to true.
    assert.match(gate.outputs.run, /steps\.app\.outputs\.run \|\| 'true'/u);
    const [checkout, step] = gate.steps;
    assert.equal(gate.steps.length, 2);
    assert.equal(checkout['continue-on-error'], true);
    assert.equal(checkout.with['persist-credentials'], false);
    assert.equal(step.uses, './.github/actions/affected-gate');
    assert.equal(step['continue-on-error'], true);
    // Non-PR events (production deploys) must never check out or run the gate.
    assert.match(checkout.uses, /^actions\/checkout@/u);
    assert.equal(checkout.if, "github.event_name == 'pull_request'");
    assert.equal(step.if, "github.event_name == 'pull_request'");
    for (const file of [
      'affected-apps.mjs',
      'affected-apps.extra-edges.json',
      'affected-gate.mjs',
    ]) {
      assert.ok(
        checkout.with['sparse-checkout'].includes(`/scripts/ci/${file}`),
        `sparse checkout must include ${file}`
      );
    }
    for (const app of String(step.with.app).split(',')) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, 'apps', app.trim(), 'package.json')),
        `apps/${app} must exist or the gate cannot match it`
      );
    }
  });

  test(`${file}: the gate output is true without a gate step on every non-PR event`, () => {
    const output = workflow.jobs['affected-gate'].outputs.run;
    const run = (eventName, steps) =>
      evaluateExpression(output, { github: { event_name: eventName }, steps });
    for (const eventName of [
      'push',
      'workflow_dispatch',
      'schedule',
      'workflow_run',
      'merge_group',
      'release',
    ]) {
      // Skipped steps leave no outputs; a failing or unexpectedly set step must not matter either.
      assert.equal(run(eventName, {}), 'true', eventName);
      assert.equal(
        run(eventName, { app: { outputs: { run: 'false' } } }),
        'true',
        eventName
      );
    }
    assert.equal(run('pull_request', {}), 'true');
    assert.equal(
      run('pull_request', { app: { outputs: { run: 'true' } } }),
      'true'
    );
    assert.equal(
      run('pull_request', { app: { outputs: { run: 'false' } } }),
      'false'
    );
  });

  test(`${file}: jobs consume the gate with preserved status guards`, () => {
    let consumers = 0;
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (id === 'affected-gate') continue;
      const condition = String(job.if ?? '');
      if (
        id === 'check-ci' ||
        id === 'deploy' ||
        id.startsWith('native-publish-')
      )
        continue;
      assert.ok(
        condition.includes('needs.affected-gate.outputs.run'),
        `${id}: must consume the app gate`
      );
      consumers += 1;
      assert.ok(needsOf(job).includes('affected-gate'), `${id}: needs`);
      assert.match(condition, /needs\.affected-gate\.outputs\.run == 'true'/u);
      const retainedCancellation =
        file === 'meet-cloudflare.yaml' && id === 'validate';
      if (retainedCancellation) assert.match(condition, /!cancelled\(\)/u);
      assert.doesNotMatch(
        retainedCancellation
          ? condition.replace('!cancelled()', 'true')
          : condition,
        /\b(always|failure|cancelled)\(\)/u,
        id
      );
    }
    assert.ok(consumers > 0, 'a gate with no consumer is dead weight');
  });
}

for (const [file, workflow] of gated) {
  const checkCi = workflow.jobs['check-ci'];
  if (!checkCi) continue;
  test(`${file}: the configuration check waits for the gate and skips unaffected pull requests`, () => {
    assert.deepEqual(needsOf(checkCi), ['affected-gate']);
    const skipped = admittedPrContext('false');
    const affected = admittedPrContext('true');
    assert.equal(evaluateExpression(checkCi.if, skipped), false);
    assert.equal(evaluateExpression(checkCi.if, affected), true);
    const push = admittedPrContext('true');
    push.github.event_name = 'push';
    push.github.ref = 'refs/heads/main';
    assert.equal(evaluateExpression(checkCi.if, push), true);
    const unlabeled = admittedPrContext('true');
    unlabeled.github.event.pull_request.labels = [];
    assert.equal(evaluateExpression(checkCi.if, unlabeled), false);
  });
}
