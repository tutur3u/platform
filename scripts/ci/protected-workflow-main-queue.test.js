const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mainArtifactProducers,
  mainSupersession,
  context,
  render,
  workflows,
} = require('./protected-workflow-concurrency-helpers.js');

// Listed pure CI producers supersede on main instead; see
// scripts/ci/main-supersession-workflows.test.js.
for (const file of mainArtifactProducers.filter(
  (name) => !mainSupersession.includes(name)
)) {
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

test('Oxc keeps each main push', () => {
  const proof = [];
  for (const id of ['check-ci', 'duplicate-validation', 'format', 'lint']) {
    proof.push([
      `oxc-check.yaml:${id}`,
      workflows['oxc-check.yaml'].jobs[id].concurrency,
    ]);
  }
  for (const [name, policy] of proof) {
    const first = {
      ...context('refs/heads/main', 'a'.repeat(40), 11),
      workflow: name,
    };
    const second = {
      ...context('refs/heads/main', 'b'.repeat(40), 22),
      workflow: name,
    };
    assert.notEqual(
      render(policy.group, first),
      render(policy.group, second),
      name
    );
    assert.equal(render(policy['cancel-in-progress'], first), false, name);
    assert.equal(render(policy['cancel-in-progress'], second), false, name);
    const feature = {
      ...first,
      ref: 'refs/heads/fix/example',
      sha: 'c'.repeat(40),
      run_id: 3,
    };
    const featureNext = {
      ...feature,
      sha: 'd'.repeat(40),
      run_id: 4,
    };
    assert.equal(
      render(policy.group, feature),
      render(policy.group, featureNext),
      name
    );
    assert.equal(render(policy['cancel-in-progress'], feature), true, name);
    const spoof = { ...first, ref: 'refs/heads/main-spoof' };
    const spoofNext = { ...spoof, sha: 'e'.repeat(40), run_id: 5 };
    assert.equal(
      render(policy.group, spoof),
      render(policy.group, spoofNext),
      name
    );
    assert.equal(render(policy['cancel-in-progress'], spoof), true, name);
  }
});

test('Cloudflare Source and docs preserve every main push', () => {
  const files = Object.entries(workflows)
    .filter(([, workflow]) =>
      String(workflow.name || '').endsWith(' Cloudflare Source')
    )
    .map(([file]) => file)
    .sort();
  assert.ok(files.includes('finance-cloudflare.yaml'));
  assert.ok(files.includes('nova-cloudflare.yaml'));
  assert.equal(files.length, 25);
  files.push('docs-seo-check.yaml');
  for (const file of files) {
    const supersedes = mainSupersession.includes(file);
    const policy = workflows[file].concurrency;
    const first = {
      ...context('refs/heads/main', 'a'.repeat(40), 11),
      workflow: workflows[file].name,
    };
    const second = {
      ...context('refs/heads/main', 'b'.repeat(40), 22),
      workflow: workflows[file].name,
    };
    assert.equal(
      render(policy.group, first) === render(policy.group, second),
      supersedes,
      file
    );
    const cancel = policy['cancel-in-progress'];
    assert.equal(render(cancel, first), supersedes, file);
    assert.equal(render(cancel, second), supersedes, file);
    const feature = {
      ...first,
      ref: 'refs/heads/fix/example',
      sha: 'c'.repeat(40),
      run_id: 3,
    };
    assert.equal(
      render(policy.group, feature),
      render(policy.group, { ...feature, sha: 'd'.repeat(40), run_id: 4 }),
      file
    );
    assert.equal(render(policy['cancel-in-progress'], feature), true, file);
    const spoof = { ...first, ref: 'refs/heads/main-spoof' };
    assert.equal(
      render(policy.group, spoof),
      render(policy.group, { ...spoof, sha: 'e'.repeat(40), run_id: 5 }),
      file
    );
    assert.equal(render(policy['cancel-in-progress'], spoof), true, file);
    const pull = {
      ...context('refs/pull/7/merge', 'f'.repeat(40), 6, 'pull_request', 7),
      workflow: workflows[file].name,
    };
    assert.equal(render(policy['cancel-in-progress'], pull), true, file);
  }
});
