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
const needsOf = (job) =>
  [job.needs ?? []].flat();

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
    for (const file of ['affected-apps.mjs', 'affected-apps.extra-edges.json', 'affected-gate.mjs']) {
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
    for (const eventName of ['push', 'workflow_dispatch', 'schedule', 'workflow_run', 'merge_group', 'release']) {
      // Skipped steps leave no outputs; a failing or unexpectedly set step must not matter either.
      assert.equal(run(eventName, {}), 'true', eventName);
      assert.equal(run(eventName, { app: { outputs: { run: 'false' } } }), 'true', eventName);
    }
    assert.equal(run('pull_request', {}), 'true');
    assert.equal(run('pull_request', { app: { outputs: { run: 'true' } } }), 'true');
    assert.equal(run('pull_request', { app: { outputs: { run: 'false' } } }), 'false');
  });

  test(`${file}: jobs reading the gate depend on it and never use status functions`, () => {
    let consumers = 0;
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (id === 'affected-gate') continue;
      const condition = String(job.if ?? '');
      if (!condition.includes('needs.affected-gate.outputs.run')) continue;
      consumers += 1;
      assert.ok(needsOf(job).includes('affected-gate'), `${id}: needs`);
      assert.match(condition, /needs\.affected-gate\.outputs\.run == 'true'/u);
      assert.doesNotMatch(condition, /\b(always|failure|cancelled)\(\)/u, id);
    }
    assert.ok(consumers > 0, 'a gate with no consumer is dead weight');
  });
}
