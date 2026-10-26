const assert = require('node:assert/strict');
const test = require('node:test');

const { readWorkflow } = require('./workflow-yaml-test-helper');
const { DEFAULT_MATRIX } = require('./e2e-result-plan');

test('translation checks run once per PR update and still cover both protected branches and forks', () => {
  const workflow = readWorkflow('i18n-check.yaml');
  assert.deepEqual(workflow.on.push.branches, ['main', 'production']);
  // Only prose and agent-instruction PRs skip; no locale bundle lives there.
  assert.deepEqual(workflow.on.pull_request, {
    'paths-ignore': [
      '**/*.md',
      '**/*.mdx',
      'apps/docs/**',
      'plans/**',
      'plugins/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
    ],
  });
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  // PR and main runs coalesce; production and manual attempts retain exact evidence.
  assert.equal(
    workflow.concurrency.group,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
    "${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}-${{ (github.run_attempt > 1 || (github.event_name != 'pull_request' && github.event_name != 'pull_request_target' && (github.event_name != 'push' || github.ref == 'refs/heads/production' || startsWith(github.ref, 'refs/heads/release-please--branches--')))) && format('{0}-{1}-{2}', github.sha, github.run_id, github.run_attempt) || 'latest' }}"
  );
  for (const id of [
    'i18n-sort-check',
    'i18n-translation-check',
    'i18n-namespace-check',
    'i18n-key-parity-check',
  ]) {
    assert.ok(workflow.jobs[id], `Missing existing validation ${id}`);
  }
});

test('E2E reuses shared exact Supabase images without changing its paused cohorts', () => {
  const workflow = readWorkflow('e2e-tests.yaml');
  const job = workflow.jobs.e2e;
  assert.equal(
    job.strategy.matrix,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
    '${{ fromJSON(needs.relevance.outputs.matrix) }}',
    'E2E must allocate the dynamic, uncached cohorts from the planner'
  );
  const cache = job.steps.find(
    (step) => step.name === 'Restore shared Supabase images'
  );
  assert.equal(cache.uses, './.github/actions/cache-supabase-images');
  assert.deepEqual(cache.with, {
    profile: 'full',
    save: `\${{ matrix.mode == 'shard' && matrix.shard == 1 }}`,
  });
  assert.equal(cache.if, "env.E2E_SUPABASE_IMAGE_TRANSPORT == 'cache'");
  assert.equal(workflow.env.SUPABASE_INTERNAL_IMAGE_REGISTRY, 'public.ecr.aws');
  assert.equal(
    job.steps.some((step) => step.id === 'prepare-supabase-docker-cache'),
    false
  );
  const save = Function(
    'matrix',
    `return ${cache.with.save.replace(/^\$\{\{\s*|\s*\}\}$/g, '')}`
  );
  const eligible = DEFAULT_MATRIX.filter((entry) => save(entry));
  const inventory = workflow.jobs['inventory-storefront-cache-e2e'].steps.find(
    (step) => step.name === 'Restore shared Supabase images'
  );
  assert.equal(inventory.with.save, 'false');
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 1);
  assert.equal(DEFAULT_MATRIX.length, 10, 'Do not remove test cohorts');
  assert.equal(job.strategy['fail-fast'], false);
});

test('failed invitation cohorts retain distinct diagnostic artifacts', () => {
  const job = readWorkflow('e2e-tests.yaml').jobs.e2e;
  const upload = job.steps.find(
    (step) => step.name === 'Upload E2E failure artifact'
  );
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
  assert.equal(upload.with.name, 'e2e-failure-${{ matrix.id }}');
  const names = DEFAULT_MATRIX.map((entry) => `e2e-failure-${entry.id}`);
  assert.equal(new Set(names).size, names.length);
});

test('superseded PR runs cancel, production release evidence does not', () => {
  for (const name of ['i18n-check.yaml', 'e2e-tests.yaml']) {
    const concurrency = readWorkflow(name).concurrency;
    const policy = concurrency['cancel-in-progress'];
    assert.equal(
      policy,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      "${{ !(github.run_attempt > 1) && (github.event_name == 'pull_request' || github.event_name == 'pull_request_target' || (github.event_name == 'push' && github.ref != 'refs/heads/production' && !startsWith(github.ref, 'refs/heads/release-please--branches--'))) }}"
    );
    assert.equal(
      concurrency.group,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      "${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}-${{ (github.run_attempt > 1 || (github.event_name != 'pull_request' && github.event_name != 'pull_request_target' && (github.event_name != 'push' || github.ref == 'refs/heads/production' || startsWith(github.ref, 'refs/heads/release-please--branches--')))) && format('{0}-{1}-{2}', github.sha, github.run_id, github.run_attempt) || 'latest' }}"
    );
  }
});
