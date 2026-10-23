const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const {
  readAllWorkflows,
  readWorkflow,
} = require('./workflow-yaml-test-helper');

const repository = 'tutur3u/platform';
const attacker = 'attacker/platform';

function triggersOf(workflow) {
  const on = workflow.on ?? workflow.true;
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.map((t) => [t, null]));
  return on ?? {};
}

function loadWorkflows() {
  return Object.entries(readAllWorkflows()).map(([file, workflow]) => ({
    file,
    workflow,
  }));
}

function evaluateIf(expression, github) {
  const source = String(expression)
    .trim()
    .replace(/^\$\{\{([\s\S]*)\}\}$/u, '$1')
    .replace(/needs\.([\w-]+)/gu, 'needs["$1"]')
    .replace(/steps\.([\w-]+)/gu, 'steps["$1"]');
  const lower = (value) => String(value ?? '').toLowerCase();
  return Boolean(
    vm.runInNewContext(
      source,
      {
        always: () => true,
        cancelled: () => false,
        contains: (haystack, needle) =>
          Array.isArray(haystack)
            ? haystack.some((item) => lower(item) === lower(needle))
            : lower(haystack).includes(lower(needle)),
        endsWith: (value, suffix) => lower(value).endsWith(lower(suffix)),
        failure: () => false,
        format: (template, ...args) =>
          template.replace(/\{(\d+)\}/gu, (_, i) => String(args[i] ?? '')),
        fromJSON: (value) => JSON.parse(value),
        github,
        inputs: {},
        needs: new Proxy(
          {},
          { get: () => ({ outputs: {}, result: 'success' }) }
        ),
        startsWith: (value, prefix) => lower(value).startsWith(lower(prefix)),
        steps: new Proxy({}, { get: () => ({ outputs: {} }) }),
        success: () => true,
        toJSON: (value) => JSON.stringify(value),
        vars: {},
      },
      { timeout: 100 }
    )
  );
}

function completion(upstreamName, headBranch, overrides = {}) {
  return {
    event: {
      workflow_run: {
        conclusion: 'success',
        event: 'pull_request',
        head_branch: headBranch,
        head_repository: { full_name: attacker },
        head_sha: 'a'.repeat(40),
        id: 1,
        name: upstreamName,
        run_attempt: 1,
        ...overrides,
      },
    },
    event_name: 'workflow_run',
    ref: 'refs/heads/main',
    repository,
    run_attempt: 1,
  };
}

// Jobs that would run for this event: a job is skipped when its own `if` is
// false or when it needs a skipped job without forcing evaluation (always()).
function runningJobs(workflow, github) {
  const skipped = new Set();
  const jobs = Object.entries(workflow.jobs);
  for (let pass = 0; pass < jobs.length; pass += 1) {
    for (const [id, job] of jobs) {
      if (skipped.has(id)) continue;
      const needs = [job.needs ?? []].flat();
      const forced = /\b(always|failure|cancelled)\(\)/u.test(
        String(job.if ?? '')
      );
      if (
        (job.if !== undefined && !evaluateIf(job.if, github)) ||
        (!forced && needs.some((need) => skipped.has(need)))
      ) {
        skipped.add(id);
      }
    }
  }
  return jobs.map(([id]) => id).filter((id) => !skipped.has(id));
}

// workflow_run matches upstream workflows by name, and a fork PR can add a
// workflow with any name and run it on pull_request from a branch named after
// any protected branch. Every consumer is therefore fork-reachable, whatever
// its real upstream's triggers are; head_branch and branch filters never prove
// trust. Both the event and the head repository must be checked.
const spoofedCompletions = {
  'fork pull request': { event: 'pull_request' },
  'fork head repository': { event: 'push' },
  'same-repository pull request': {
    event: 'pull_request',
    head_repository: { full_name: repository },
  },
};

function workflowRunConsumers(all = loadWorkflows()) {
  return all.flatMap(({ file, workflow }) => {
    const trigger = triggersOf(workflow).workflow_run;
    if (trigger === undefined) return [];
    return (trigger?.workflows ?? []).map((upstreamName) => ({
      branches: trigger?.branches ?? ['main', 'production'],
      file,
      upstreamName,
      workflow,
    }));
  });
}

function spoofFailures(consumers) {
  return consumers.flatMap(({ branches, file, upstreamName, workflow }) =>
    branches.flatMap((headBranch) =>
      Object.entries(spoofedCompletions).flatMap(([label, overrides]) => {
        const running = runningJobs(
          workflow,
          completion(upstreamName, headBranch, overrides)
        );
        return running.length === 0
          ? []
          : [
              `${file}: ${running.join(', ')} run for a ${label} completion of "${upstreamName}" on "${headBranch}"`,
            ];
      })
    )
  );
}

test('every workflow_run consumer rejects name-spoofed completions', () => {
  const consumers = workflowRunConsumers();
  for (const file of [
    'discord-modal-deploy.yml',
    'production-package-resume.yaml',
    'release-please-transient-retry.yaml',
    'supabase-production.yaml',
    'supabase-staging.yaml',
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
  const staging = consumers.find(
    ({ file }) => file === 'supabase-staging.yaml'
  );
  for (const [guard, label] of [
    [
      /github\.event\.workflow_run\.event == 'push' &&/u,
      'same-repository pull request',
    ],
    [
      /&&\s*github\.event\.workflow_run\.head_repository\.full_name == github\.repository/u,
      'fork head repository',
    ],
  ]) {
    const weakened = structuredClone(staging);
    weakened.workflow.jobs.migrate.if =
      staging.workflow.jobs.migrate.if.replace(guard, '');
    assert.notEqual(
      weakened.workflow.jobs.migrate.if,
      staging.workflow.jobs.migrate.if
    );
    assert.match(spoofFailures([weakened]).join('\n'), new RegExp(label, 'u'));
  }
});

test('Supabase Staging migrates only trusted main push completions', () => {
  const workflow = readWorkflow('supabase-staging.yaml');
  const migrate = workflow.jobs.migrate;
  const trusted = (overrides = {}) =>
    completion('Vercel Platform Preview Deployment', 'main', {
      event: 'push',
      head_repository: { full_name: repository },
      ...overrides,
    });
  assert.deepEqual(runningJobs(workflow, trusted()), ['migrate']);
  assert.deepEqual(
    runningJobs(workflow, { event_name: 'workflow_dispatch', repository }),
    ['migrate']
  );
  for (const overrides of [
    { event: 'pull_request' },
    { event: 'workflow_dispatch' },
    { head_repository: { full_name: attacker } },
    { head_branch: 'feature/x' },
    { conclusion: 'failure' },
  ]) {
    assert.deepEqual(runningJobs(workflow, trusted(overrides)), []);
  }

  // Secrets reach only the migration step, after the target checkout and the
  // target's tuturuuu.ci.ts have been admitted by the job gate.
  assert.equal(migrate.env.SUPABASE_ACCESS_TOKEN, undefined);
  const withSecrets = migrate.steps
    .filter((step) => /secrets\./u.test(JSON.stringify(step.env ?? {})))
    .map((step) => step.name);
  assert.deepEqual(withSecrets, ['Deploy migrations to staging']);
  const checkout = migrate.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with['persist-credentials'], false);
  assert.ok(
    migrate.steps.every(
      (step) => !/\$\{\{\s*(?:env|secrets)\./u.test(step.run ?? '')
    ),
    'staging scripts read secrets from env, not interpolation'
  );
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
  const deploy = workflow.jobs.deploy.if;
  const trusted = (overrides) =>
    completion('Discord Python CI', 'main', {
      event: 'push',
      head_repository: { full_name: repository },
      ...overrides,
    });
  assert.equal(evaluateIf(deploy, trusted({})), true);
  assert.equal(
    evaluateIf(deploy, { event_name: 'workflow_dispatch', repository }),
    true
  );
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
  weakened.jobs.deploy.if = deploy
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
    /deploy run for a fork pull request completion/u
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
