const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const fixturePath = path.join(
  __dirname,
  'fixtures/workflow-run-decisions.json'
);

function triggers(workflow) {
  const on = workflow.on;
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on))
    return Object.fromEntries(on.map((event) => [event, null]));
  if (!on || typeof on !== 'object') return {};
  return on;
}

function classify(file, workflow) {
  const tags = [];
  const jobs = JSON.stringify(workflow.jobs ?? {});
  if (workflow.jobs?.['affected-gate']) tags.push('planner-affected-gate');
  if (jobs.includes('.github/workflows/ci-plan.yaml')) tags.push('planner-job');
  if (file === 'vercel-production.yaml') tags.push('vercel-production-planner');
  const filtered = Object.values(triggers(workflow)).some(
    (body) => body && (body.paths || body['paths-ignore'])
  );
  if (filtered) tags.push('path-filters');
  if (
    !tags.includes('planner-affected-gate') &&
    !tags.includes('planner-job') &&
    (jobs.includes('ci-plan.mjs') || jobs.includes('affected-apps.mjs'))
  )
    tags.push('diff-script');
  if (tags.length === 0) tags.push('always');
  return tags.sort();
}

function inventory(workflows = readAllWorkflows(undefined, { raw: true })) {
  return Object.fromEntries(
    Object.entries(workflows)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, workflow]) => [file, classify(file, workflow)])
  );
}

test('every workflow records how it decides to run', () => {
  const live = inventory();
  const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.deepEqual(live, expected);
  const gated = Object.values(live).filter((tags) =>
    tags.includes('planner-affected-gate')
  );
  assert.ok(gated.length >= 37);
  for (const tags of gated) assert.ok(tags.includes('path-filters'));
  assert.ok(live['mobile.yaml'].includes('path-filters'));
  assert.equal(live['mobile.yaml'].includes('planner-job'), false);
  assert.ok(
    live['vercel-production.yaml'].includes('vercel-production-planner')
  );
  assert.ok(live['type-check.yaml'].includes('planner-job'));
  assert.ok(live['turbo-unit-tests.yaml'].includes('planner-job'));
  assert.ok(live['oxc-check.yaml'].includes('planner-job'));
  assert.ok(live['docs-seo-check.yaml'].includes('planner-job'));
  assert.ok(live['app-builds-affected.yaml'].includes('diff-script'));
});
