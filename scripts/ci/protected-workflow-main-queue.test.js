const assert = require('node:assert/strict');
const test = require('node:test');
const {
  boundedMainProducers,
  mainArtifactProducers,
  context,
  pushesMain,
  render,
  workflows,
} = require('./protected-workflow-concurrency-helpers.js');

for (const file of boundedMainProducers) {
  test(`${file}: main keeps the active run and shares the default pending slot`, () => {
    const { concurrency: policy, name: workflow } = workflows[file];
    assert.ok(pushesMain(workflows[file]));
    const first = { ...context('refs/heads/main'), workflow };
    const latest = { ...first, sha: 'latest', run_id: 3 };
    assert.equal(render(policy.group, first), render(policy.group, latest));
    assert.equal(render(policy['cancel-in-progress'], first), false);
    assert.equal(render(policy['cancel-in-progress'], latest), false);
    assert.equal(policy.queue, undefined);
    assert.equal(
      render(policy['cancel-in-progress'], {
        ...latest,
        ref: 'refs/heads/main-spoof',
      }),
      true
    );
  });
}

for (const file of mainArtifactProducers) {
  test(`${file}: pending main artifact attempts retain distinct groups`, () => {
    const { concurrency: policy, jobs, name: workflow } = workflows[file];
    const first = { ...context('refs/heads/main'), workflow };
    const candidates = [
      first,
      { ...first, sha: 'second', run_id: 2 },
      { ...first, run_id: 3 },
    ];
    assert.equal(
      new Set(candidates.map((run) => render(policy.group, run))).size,
      candidates.length
    );
    for (const run of candidates) {
      assert.equal(render(policy['cancel-in-progress'], run), false);
    }
    for (const [id, job] of Object.entries(jobs)) {
      if (!job.concurrency) continue;
      const lock = job.concurrency;
      assert.equal(render(lock['cancel-in-progress'], first), false, id);
      if (render(lock.group, first) === render(lock.group, candidates[1])) {
        assert.equal(lock.queue, 'max', id);
      }
    }
  });
}

test('generated Cloudflare callers preserve pending main artifacts', async () => {
  const { callerWorkflow } =
    await import('../start-bridge-codemod/ci-templates.mjs');
  const yaml = callerWorkflow({
    app: 'infrastructure',
    rootHost: 'tuturuuu.com',
    packageName: '@tuturuuu/admin',
    closure: [],
    formatPaths: [],
    hasTestScript: true,
  });
  const group = yaml.match(/^  group: (.+)$/mu)[1];
  const cancels = yaml.match(/^  cancel-in-progress: (.+)$/mu)[1];
  const main = context('refs/heads/main');
  const next = { ...main, sha: 'second', run_id: 2 };
  assert.notEqual(render(group, main), render(group, next));
  assert.equal(render(cancels, main), false);
  const pr = context('refs/pull/7/merge', 'first', 1, 'pull_request', 7);
  assert.equal(render(cancels, pr), true);
  assert.equal(
    render(group, pr),
    render(group, { ...pr, sha: 'second', run_id: 2 })
  );
});
