const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const {
  readAllWorkflows,
  readWorkflow,
} = require('./workflow-yaml-test-helper');

const repository = 'tutur3u/platform';
const pullRequestEvents = ['pull_request', 'pull_request_target'];

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

// A workflow_run consumer inherits every upstream's trigger surface, including
// upstreams that are themselves workflow_run consumers.
function pullRequestReachable(name, byName, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const upstream = byName.get(name);
  assert.ok(upstream, `workflow_run references unknown workflow "${name}"`);
  const triggers = triggersOf(upstream.workflow);
  if (pullRequestEvents.some((event) => event in triggers)) return true;
  return (triggers.workflow_run?.workflows ?? []).some((next) =>
    pullRequestReachable(next, byName, seen)
  );
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

function forkCompletion(upstreamName, headBranch) {
  return {
    event: {
      workflow_run: {
        conclusion: 'success',
        event: 'pull_request',
        head_branch: headBranch,
        head_repository: { full_name: 'attacker/platform' },
        head_sha: 'a'.repeat(40),
        id: 1,
        name: upstreamName,
        run_attempt: 1,
      },
    },
    event_name: 'workflow_run',
    ref: 'refs/heads/main',
    repository,
    run_attempt: 1,
  };
}

// A fork can name its PR branch after any protected branch, so head_branch and
// branch filters never prove trust. Each job must reject the fork completion
// itself or depend on a job that does without forcing evaluation (always()).
function assertForkCompletionRejected(workflow, upstreamName, headBranch) {
  const github = forkCompletion(upstreamName, headBranch);
  const rejected = new Set();
  const jobs = Object.entries(workflow.jobs);
  for (let pass = 0; pass < jobs.length; pass += 1) {
    for (const [id, job] of jobs) {
      if (rejected.has(id)) continue;
      const needs = [job.needs ?? []].flat();
      const forced = /\b(always|failure|cancelled)\(\)/u.test(
        String(job.if ?? '')
      );
      if (
        (job.if !== undefined && !evaluateIf(job.if, github)) ||
        (!forced && needs.some((need) => rejected.has(need)))
      ) {
        rejected.add(id);
      }
    }
  }
  return jobs.map(([id]) => id).filter((id) => !rejected.has(id));
}

function pullRequestFedConsumers() {
  const all = loadWorkflows();
  const byName = new Map(all.map((entry) => [entry.workflow.name, entry]));
  return all.flatMap(({ file, workflow }) => {
    const upstreams = triggersOf(workflow).workflow_run?.workflows ?? [];
    return upstreams
      .filter((name) => pullRequestReachable(name, byName))
      .map((upstreamName) => ({ file, upstreamName, workflow }));
  });
}

test('workflow_run consumers reject fork pull request completions', () => {
  const consumers = pullRequestFedConsumers();
  assert.ok(
    consumers.some(({ file }) => file === 'discord-modal-deploy.yml'),
    'Discord Modal deploy must stay covered while Discord Python CI runs on pull_request'
  );
  for (const { file, upstreamName, workflow } of consumers) {
    const branches = triggersOf(workflow).workflow_run?.branches ?? [
      'main',
      'production',
    ];
    for (const headBranch of branches) {
      assert.deepEqual(
        assertForkCompletionRejected(workflow, upstreamName, headBranch),
        [],
        `${file}: jobs run for a fork PR completion of "${upstreamName}" on branch "${headBranch}"`
      );
    }
  }
});

test('Discord Modal deploy accepts only trusted main push completions', () => {
  const workflow = readWorkflow('discord-modal-deploy.yml');
  const deploy = workflow.jobs.deploy.if;
  const completion = (overrides) => {
    const github = forkCompletion('Discord Python CI', 'main');
    Object.assign(github.event.workflow_run, {
      event: 'push',
      head_repository: { full_name: repository },
      ...overrides,
    });
    return github;
  };
  assert.equal(evaluateIf(deploy, completion({})), true);
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
    assert.equal(evaluateIf(deploy, completion(overrides)), false);
  }

  // Removing the fork guard must be caught by the generic consumer check.
  const weakened = structuredClone(workflow);
  weakened.jobs.deploy.if = deploy
    .replace(/github\.event\.workflow_run\.event == 'push' &&/u, '')
    .replace(
      /&&\s*github\.event\.workflow_run\.head_repository\.full_name == github\.repository/u,
      ''
    );
  assert.deepEqual(
    assertForkCompletionRejected(weakened, 'Discord Python CI', 'main'),
    ['deploy']
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
