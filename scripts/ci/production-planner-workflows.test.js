const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');
const { repoRoot } = require('./workflow-config-test-helpers.js');

const planner = readWorkflow('vercel-production.yaml');

test('the serialized production planner calls only Cloudflare production workflows', () => {
  assert.deepEqual(planner.on.push.branches, ['production']);
  assert.equal(planner.concurrency['cancel-in-progress'], false);
  assert.equal(planner.concurrency.queue, 'max');
  assert.match(planner.concurrency.group, /production-deployment-planner/);
  assert.ok(
    planner.jobs.plan.steps.some(({ run }) =>
      run?.includes('scripts/ci/resolve-production-targets.ts')
    )
  );
  assert.deepEqual(
    readdirSync(join(repoRoot, '.github/workflows')).filter((file) =>
      /^vercel-production-.*\.ya?ml$/.test(file)
    ),
    []
  );
  for (const [id, job] of Object.entries(planner.jobs)) {
    if (id === 'plan') continue;
    assert.equal(job.needs, 'plan', id);
    assert.match(
      job.uses,
      /^\.\/\.github\/workflows\/(?:.*-cloudflare|web-cloudflare-production)\.yaml$/
    );
    if (id === 'deploy-web-cloudflare') continue;
    assert.ok(job.if.includes(`'${job.uses.split('/').at(-1)}'`), id);
  }
  assert.equal(
    planner.jobs['deploy-tasks'].uses,
    './.github/workflows/tasks-cloudflare.yaml'
  );
});

test('the planner verifies Web for each admitted production revision', () => {
  const web = planner.jobs['deploy-web-cloudflare'];
  assert.equal(web.uses, './.github/workflows/web-cloudflare-production.yaml');
  assert.match(web.if, /needs\.plan\.outputs\.superseded == 'false'/);
  assert.deepEqual(web.permissions, { contents: 'read', deployments: 'write' });
});
