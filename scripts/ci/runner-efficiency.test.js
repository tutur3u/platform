const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const readWorkflow = (name) =>
  JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        path.resolve(__dirname, '../../.github/workflows', name),
      ],
      { encoding: 'utf8' }
    )
  );

test('translation checks run once per PR update and still cover both protected branches and forks', () => {
  const workflow = readWorkflow('i18n-check.yaml');
  assert.deepEqual(workflow.on.push.branches, ['main', 'production']);
  assert.equal(workflow.on.pull_request, null);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  // PR merge refs isolate forks and preserve validation of the merged result.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
  assert.equal(workflow.concurrency.group, 'i18n-${{ github.ref }}');
  for (const id of [
    'i18n-sort-check',
    'i18n-translation-check',
    'i18n-namespace-check',
    'i18n-key-parity-check',
  ]) {
    assert.ok(workflow.jobs[id], `Missing existing validation ${id}`);
  }
});

test('exactly one E2E matrix job is eligible to write the shared Docker cache', () => {
  const workflow = readWorkflow('e2e-tests.yaml');
  const job = workflow.jobs.e2e;
  const writer = job.steps.find(
    (step) => step.id === 'prepare-supabase-docker-cache'
  );
  assert.equal(
    writer.if,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
    "${{ always() && env.E2E_SUPABASE_IMAGE_TRANSPORT == 'cache' && github.ref == 'refs/heads/main' && matrix.mode == 'shard' && matrix.shard == 1 && steps.cache-supabase.outputs.cache-matched-key == '' }}"
  );
  const eligible = job.strategy.matrix.include.filter(
    (entry) => entry.mode === 'shard' && entry.shard === 1
  );
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 1);
  assert.equal(
    job.strategy.matrix.include.length,
    10,
    'Do not remove test cohorts'
  );
  assert.equal(job.strategy['fail-fast'], false);
});

test('failed invitation cohorts retain distinct diagnostic artifacts', () => {
  const job = readWorkflow('e2e-tests.yaml').jobs.e2e;
  const upload = job.steps.find(
    (step) => step.name === 'Upload E2E failure artifact'
  );
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
  assert.equal(upload.with.name, 'e2e-failure-${{ matrix.id }}');
  const names = job.strategy.matrix.include.map(
    (entry) => `e2e-failure-${entry.id}`
  );
  assert.equal(new Set(names).size, names.length);
});

test('superseded PR runs cancel, protected release evidence does not', () => {
  for (const name of ['i18n-check.yaml', 'e2e-tests.yaml']) {
    const policy = readWorkflow(name).concurrency['cancel-in-progress'];
    assert.equal(
      policy,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      "${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/production' }}"
    );
  }
});
