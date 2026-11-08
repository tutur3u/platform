const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  completion,
  evaluateIf,
  loadWorkflows,
  recomputeOnlyConsumers,
  repository,
  runningJobs,
  spoofFailures,
  workflowRunConsumers,
} = require('./workflow-run-trust-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

// These tests cover the expression layer (job `if`) of each consumer. The
// exact, case-sensitive trigger proof is covered by
// workflow-run-trigger-gate.test.js.

test('every workflow_run consumer rejects name-spoofed completions', () => {
  const consumers = workflowRunConsumers();
  for (const file of [
    'discord-modal-deploy.yml',
    'production-package-resume.yaml',
    'release-please-transient-retry.yaml',
    'supabase-production.yaml',
  ]) {
    assert.ok(
      consumers.some((consumer) => consumer.file === file),
      `${file} must stay covered`
    );
  }
  assert.deepEqual(spoofFailures(consumers), []);
});

test('every workflow_run consumer still runs for its trusted upstream', () => {
  for (const {
    branches,
    file,
    upstreamName,
    workflow,
  } of workflowRunConsumers()) {
    const accepted = branches.some((headBranch) =>
      ['push', 'workflow_dispatch', 'workflow_run'].some((event) =>
        ['success', 'failure'].some(
          (conclusion) =>
            runningJobs(
              workflow,
              completion(upstreamName, headBranch, {
                conclusion,
                event,
                head_repository: { full_name: repository },
              })
            ).length > 0
        )
      )
    );
    assert.ok(accepted, `${file} never runs for "${upstreamName}"`);
  }
});

test('workflow_run consumers keep secrets out of workflow and job env', () => {
  for (const { file, workflow } of workflowRunConsumers()) {
    const scopes = [
      ['workflow', workflow.env],
      ...Object.entries(workflow.jobs).map(([id, job]) => [id, job.env]),
    ];
    for (const [where, env] of scopes) {
      assert.doesNotMatch(
        JSON.stringify(env ?? {}),
        /secrets\./u,
        `${file}:${where} exposes secrets beyond the steps that use them`
      );
    }
  }
});

test('spoof check catches each missing workflow_run guard', () => {
  const consumers = workflowRunConsumers();
  // Supabase Production: each guard on the admission job is load-bearing.
  const production = consumers.filter(
    ({ file }) => file === 'supabase-production.yaml'
  );
  for (const [guard, label] of [
    [
      /github\.event\.workflow_run\.head_repository\.full_name == github\.repository && /u,
      'fork head repository',
    ],
    [
      / && \(github\.event\.workflow_run\.event == 'push' \|\| github\.event\.workflow_run\.event == 'workflow_dispatch'\)/u,
      'same-repository pull request completion of "Production Deployment Planner"',
    ],
    [
      / && \(github\.event\.workflow_run\.event == 'push' \|\| github\.event\.workflow_run\.event == 'workflow_run' \|\| github\.event\.workflow_run\.event == 'workflow_dispatch'\)/u,
      'same-repository pull request completion of "Supabase Staging Migration"',
    ],
  ]) {
    const weakened = production.map((consumer) => {
      const copy = structuredClone(consumer);
      const job = copy.workflow.jobs['evaluate-prerequisites'];
      const original = job.if;
      job.if = original.replace(guard, '');
      assert.notEqual(job.if, original);
      return copy;
    });
    assert.match(spoofFailures(weakened).join('\n'), new RegExp(label, 'u'));
  }
});

test('Supabase Production evaluates only same-repository trusted completions', () => {
  const workflow = readWorkflow('supabase-production.yaml');
  for (const [upstream, branch, events] of [
    [
      'Production Deployment Planner',
      'production',
      ['push', 'workflow_dispatch'],
    ],
    [
      'Supabase Staging Migration',
      'main',
      ['workflow_run', 'workflow_dispatch'],
    ],
  ]) {
    for (const event of events) {
      const github = completion(upstream, branch, {
        event,
        head_repository: { full_name: repository },
      });
      // deploy additionally needs the evaluated should_deploy output.
      assert.deepEqual(runningJobs(workflow, github), [
        'evaluate-prerequisites',
      ]);
    }
    for (const overrides of [
      { event: 'pull_request', head_repository: { full_name: repository } },
      { event: events[0] },
    ]) {
      assert.deepEqual(
        runningJobs(workflow, completion(upstream, branch, overrides)),
        []
      );
    }
  }
});

test('Discord Modal deploy accepts only trusted main push completions', () => {
  const workflow = readWorkflow('discord-modal-deploy.yml');
  const deploy = workflow.jobs.trigger.if;
  const trusted = (overrides) =>
    completion('Discord Python CI', 'main', {
      event: 'push',
      head_repository: { full_name: repository },
      ...overrides,
    });
  assert.equal(evaluateIf(deploy, trusted({})), true);
  const dispatch = (ref) => ({
    event_name: 'workflow_dispatch',
    ref,
    repository,
  });
  assert.equal(evaluateIf(deploy, dispatch('refs/heads/main')), true);
  assert.equal(evaluateIf(deploy, dispatch('refs/heads/feature/x')), false);
  assert.equal(workflow.jobs.deploy.environment, 'discord-production');
  assert.deepEqual(runningJobs(workflow, trusted({})), ['trigger', 'deploy']);
  const checkout = workflow.jobs.deploy.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with['persist-credentials'], false);
  for (const overrides of [
    { event: 'pull_request' },
    { head_repository: { full_name: 'attacker/platform' } },
    { head_branch: 'feature/x' },
    { conclusion: 'failure' },
  ]) {
    assert.equal(evaluateIf(deploy, trusted(overrides)), false);
  }

  // Removing the fork guard must be caught by the generic consumer check.
  const weakened = structuredClone(workflow);
  weakened.jobs.trigger.if = deploy
    .replace(/github\.event\.workflow_run\.event == 'push' &&/u, '')
    .replace(
      /&&\s*github\.event\.workflow_run\.head_repository\.full_name == github\.repository/u,
      ''
    );
  assert.match(
    spoofFailures([
      {
        branches: ['main'],
        file: 'discord-modal-deploy.yml',
        upstreamName: 'Discord Python CI',
        workflow: weakened,
      },
    ]).join('\n'),
    /trigger, deploy run for a fork pull request completion/u
  );
});

test('Discord Modal credentials stay out of dependency installation', () => {
  const workflow = readWorkflow('discord-modal-deploy.yml');
  assert.equal(workflow.env.MODAL_TOKEN_ID, undefined);
  assert.equal(workflow.env.MODAL_TOKEN_SECRET, undefined);
  assert.equal(workflow.jobs.deploy.env?.MODAL_TOKEN_ID, undefined);
  const withToken = workflow.jobs.deploy.steps
    .filter((step) => step.env?.MODAL_TOKEN_ID || step.env?.MODAL_TOKEN_SECRET)
    .map((step) => step.name);
  assert.deepEqual(withToken, ['Verify Modal credentials', 'Deploy app']);
});

test('recompute-only workflow_run consumers never trust the completion', () => {
  for (const { file, workflow } of loadWorkflows()) {
    if (!recomputeOnlyConsumers.has(file)) continue;
    const serialized = JSON.stringify(workflow);
    assert.doesNotMatch(serialized, /secrets\./u, `${file} holds no secrets`);
    for (const [id, job] of Object.entries(workflow.jobs)) {
      assert.equal(job.uses, undefined, `${file}:${id} calls no workflow`);
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith('actions/checkout@')) {
          assert.ok(
            !step.uses ||
              /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u.test(step.uses.split(' ')[0]),
            `${file}:${id} runs only pinned remote or inline steps`
          );
          continue;
        }
        // Only default-branch code may be checked out, never the event head.
        assert.match(
          String(step.with?.ref),
          /^\$\{\{ github\.event\.repository\.default_branch \}\}$/u,
          `${file}:${id} checks out the default branch only`
        );
        assert.equal(step.with?.['persist-credentials'], false);
        // Only the default-branch classifier scripts, never the whole tree.
        const sparse = String(step.with?.['sparse-checkout'] ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        assert.ok(sparse.length > 0, `${file}:${id} sparse checkout only`);
        assert.ok(
          sparse.every((entry) => /^scripts\/ci\/[\w.-]+\.js$/u.test(entry)),
          `${file}:${id} checks out default-branch scripts only`
        );
      }
    }
  }
});

test('the recompute-only exemption is narrow, named and signal-only', () => {
  // Only the Security review reclassifier may consume a fork-reachable
  // completion (its upstream relay runs on pull_request_review).
  assert.deepEqual(
    [...recomputeOnlyConsumers],
    ['security-review-reclassify.yaml']
  );
  const workflow = readWorkflow('security-review-reclassify.yaml');
  const serialized = JSON.stringify(workflow);
  // No PR ref or event head is ever checked out or used as a ref.
  assert.doesNotMatch(
    serialized,
    /"ref":"[^"]*(?:pull_request|workflow_run\.head|refs\/pull)/u
  );
  assert.doesNotMatch(serialized, /secrets\./u);
  const { reclassify, resolve } = workflow.jobs;
  assert.equal(
    resolve.if,
    "github.event.workflow_run.event == 'pull_request_review'"
  );
  // Event fields are lookup keys only, and only in the resolve job: the PR
  // identity that the posting job uses comes from API-derived outputs.
  for (const [key, value] of Object.entries(resolve.outputs)) {
    assert.match(
      String(value),
      /^\$\{\{ steps\.resolve\.outputs\.[\w]+ \}\}$/u,
      `resolve output ${key}`
    );
  }
  const post = reclassify.steps.at(-1);
  for (const key of ['HEAD_SHA', 'PR_AUTHOR', 'PR_NUMBER']) {
    assert.match(
      String(post.env[key]),
      /^\$\{\{ needs\.resolve\.outputs\.[\w]+ \}\}$/u,
      key
    );
  }
  assert.doesNotMatch(
    JSON.stringify(reclassify),
    /github\.event\.(?:workflow_run|pull_request)/u
  );
});
