const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');
const { repoRoot } = require('./workflow-config-test-helpers.js');
const {
  context,
  render,
  workflows,
} = require('./protected-workflow-concurrency-helpers.js');

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

test('production planner callees keep concurrency independent of the caller', () => {
  const calls = (workflow) =>
    Object.values(workflow.jobs).flatMap((job) => {
      const local = /^\.\/\.github\/workflows\/(.+)$/u.exec(job.uses ?? '');
      return local ? [local[1]] : [];
    });
  const direct = calls(planner);
  assert.ok(direct.length > 1, 'the planner must call multiple workflows');
  const reachable = new Set(direct);
  for (const file of reachable) {
    assert.ok(workflows[file], file);
    for (const callee of calls(workflows[file])) reachable.add(callee);
  }
  const groupOf = ({ concurrency }) =>
    typeof concurrency === 'string' ? concurrency : concurrency?.group;
  const callerWorkflow =
    /\bgithub\s*(?:\.\s*workflow\b|\[\s*['"]workflow['"]\s*\])/iu;
  assert.deepEqual(
    [...reachable].filter((file) =>
      callerWorkflow.test(groupOf(workflows[file]) ?? '')
    ),
    [],
    'planner callees must not derive group identity from the caller workflow name'
  );

  for (const event of ['push', 'workflow_dispatch']) {
    const github = {
      ...context('refs/heads/production', 'revision', 1, event),
      workflow: planner.name,
    };
    const groups = new Map();
    for (const file of ['vercel-production.yaml', ...direct]) {
      const group = groupOf(workflows[file]);
      if (!group) continue;
      const key = render(group, github).toLowerCase();
      assert.ok(
        !groups.has(key),
        `${event}: ${file} collides with ${groups.get(key)}`
      );
      groups.set(key, file);
    }
  }
});
