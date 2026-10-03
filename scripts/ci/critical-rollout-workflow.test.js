const test = require('node:test');
const assert = require('node:assert/strict');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');
const expression = (value) => `$${'{'}{ ${value} }}`;
const critical = [
  'platform',
  'finance',
  'inventory',
  'contacts',
  'cms',
  'tasks',
];
for (const app of critical) {
  test(`${app} stages and verifies source/API behavior before domains or deployment markers`, () => {
    const workflow = readWorkflow(`vercel-production-${app}.yaml`);
    const steps = workflow.jobs['Deploy-Production'].steps;
    const stage = steps.findIndex((step) => step.id === 'stage_deployment');
    const probe = steps.findIndex(
      (step) => step.run === 'node scripts/ci/verify-staged-critical-app.js'
    );
    const promote = steps.findIndex((step) => step.id === 'promote');
    const marker = steps.findIndex(
      (step) => step.name === 'Record successful Vercel deployment marker'
    );
    assert.ok(
      stage >= 0 && stage < probe && probe < promote && promote < marker
    );
    assert.match(steps[stage].run, /vercel deploy.*--prod.*--skip-domain/);
    assert.equal(steps[probe]['continue-on-error'], undefined);
    assert.equal(steps[probe].env.VERCEL_STAGED_APP, app);
    assert.equal(
      steps[probe].env.VERCEL_STAGED_DEPLOYMENT_URL,
      expression('steps.stage_deployment.outputs.url')
    );
    assert.match(
      steps[promote].run,
      /vercel promote.*steps\.stage_deployment\.outputs\.url/
    );
    if (app === 'platform') {
      assert.equal(
        workflow.on.workflow_call.outputs.promoted.value,
        expression('jobs.Deploy-Production.outputs.promoted')
      );
      assert.equal(
        workflow.jobs['Deploy-Production'].outputs.promoted,
        expression('steps.promote.outputs.promoted')
      );
      for (const index of [stage, probe, promote])
        assert.equal(
          steps[index].if,
          "steps.package_release_gate.outputs.packages_ready == 'true'"
        );
    }
  });
}
test('all satellite job conditions block on failed, canceled or unpromoted selected Web', () => {
  const planner = readWorkflow('vercel-production.yaml');
  const satellites = Object.values(planner.jobs).filter(
    (job) =>
      job.uses?.startsWith('./.github/workflows/vercel-production-') &&
      !job.uses.endsWith('platform.yaml')
  );
  assert.ok(satellites.length >= 25);
  for (const job of satellites) {
    assert.deepEqual(job.needs, ['plan', 'deploy-platform']);
    const evaluate = new Function(
      'needs',
      'contains',
      'fromJSON',
      'always',
      `return ${job.if.replaceAll('needs.deploy-platform', "needs['deploy-platform']")}`
    );
    const target = job.uses.split('/').pop();
    for (const [selected, result, promoted, expected] of [
      [true, 'success', 'true', true],
      [true, 'success', '', false],
      [true, 'failure', '', false],
      [true, 'cancelled', '', false],
      [true, 'skipped', '', false],
      [false, 'skipped', '', true],
    ]) {
      const needs = {
        plan: {
          result: 'success',
          outputs: {
            workflows_json: JSON.stringify([
              target,
              ...(selected ? ['vercel-production-platform.yaml'] : []),
            ]),
          },
        },
        'deploy-platform': { result, outputs: { promoted } },
      };
      assert.equal(
        evaluate(
          needs,
          (list, value) => list.includes(value),
          JSON.parse,
          () => true
        ),
        expected,
        `${target}: ${selected}/${result}/${promoted}`
      );
      needs.plan.result = 'failure';
      assert.equal(
        evaluate(
          needs,
          (list, value) => list.includes(value),
          JSON.parse,
          () => true
        ),
        false
      );
      needs.plan.result = 'success';
      needs.plan.outputs.workflows_json = '[]';
      assert.equal(
        evaluate(
          needs,
          (list, value) => list.includes(value),
          JSON.parse,
          () => true
        ),
        false
      );
    }
  }
});
