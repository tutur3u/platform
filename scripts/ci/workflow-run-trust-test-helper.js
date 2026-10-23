// Shared harness for workflow_run trust tests. Jobs are admitted in two
// layers: the job `if` (evaluated with GitHub expression semantics, where
// `==` ignores case) and the inline "Verify trusted trigger" step, which is
// executed for real with bash, jq and a stubbed `gh`.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  evaluateExpression,
  renderTemplate,
  text,
  truthy,
} = require('./github-expression-test-helper');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

const repository = 'tutur3u/platform';
const repositoryId = 536896722;
const attacker = 'attacker/platform';
const headSha = 'a'.repeat(40);

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

function scopeFor(github, extra = {}) {
  return {
    github,
    inputs: {},
    needs: {},
    steps: {},
    vars: {},
    ...extra,
  };
}

function evaluateIf(expression, github, extra) {
  return truthy(evaluateExpression(expression, scopeFor(github, extra)));
}

function completion(upstreamName, headBranch, overrides = {}) {
  return {
    event: {
      workflow_run: {
        conclusion: 'success',
        event: 'pull_request',
        head_branch: headBranch,
        head_repository: { full_name: attacker },
        head_sha: headSha,
        id: 1,
        name: upstreamName,
        run_attempt: 1,
        ...overrides,
      },
    },
    event_name: 'workflow_run',
    ref: 'refs/heads/main',
    repository,
    repository_id: String(repositoryId),
    run_attempt: 1,
    sha: 'b'.repeat(40),
    token: 'synthetic-test-token',
  };
}

function dispatch(ref) {
  return {
    event: {},
    event_name: 'workflow_dispatch',
    ref,
    repository,
    repository_id: String(repositoryId),
    sha: 'c'.repeat(40),
    token: 'synthetic-test-token',
  };
}

function triggerStep(job) {
  return (job.steps ?? []).find((step) => step.id === 'trigger');
}

let sandbox;
function gateSandbox() {
  if (sandbox) return sandbox;
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-run-gate-'));
  process.on('exit', () =>
    fs.rmSync(sandbox, { force: true, recursive: true })
  );
  // Only the compare, branch-ref and contents APIs answer; anything else fails
  // the gate. The
  // default status answers only fully qualified refs/heads/ bases, so a gate
  // that compares against a bare branch name (which GitHub resolves to a
  // same-named tag first) gets no answer unless a test maps it explicitly.
  fs.writeFileSync(
    path.join(sandbox, 'gh'),
    `#!${process.execPath}
const [command, route] = process.argv.slice(2);
if (command !== 'api' || process.argv[4] !== '--jq') process.exit(7);
// Branch tip (git/ref/heads/<branch>) for the TIP_TREE_PATH rule.
const tip = /^repos\\/[^/]+\\/[^/]+\\/git\\/ref\\/heads\\/([\\w.-]+)$/.exec(route ?? '');
if (tip) {
  if (process.argv[5] !== '.object.sha' || !process.env.FAKE_TIP_SHA) process.exit(9);
  process.stdout.write(process.env.FAKE_TIP_SHA + '\\n');
  process.exit(0);
}
// Directory listing at a commit: answers the tree SHA mapped for that commit.
const listing = /^repos\\/[^/]+\\/[^/]+\\/contents\\/([\\w./-]+)\\?ref=([0-9a-f]{40})$/.exec(route ?? '');
if (listing) {
  const tree = JSON.parse(process.env.FAKE_TREES || '{}')[listing[2]];
  if (!/select\\(\\.type == "dir" and \\.name == "[\\w.-]+"\\) \\| \\.sha$/.test(process.argv[5] ?? '')) process.exit(10);
  if (tree) process.stdout.write(tree + '\\n');
  process.exit(0);
}
const match = /^repos\\/[^/]+\\/[^/]+\\/compare\\/([^.]+)\\.\\.\\.([0-9a-f]{40})$/.exec(route ?? '');
if (!match || process.argv[5] !== '.status') process.exit(7);
const statuses = JSON.parse(process.env.FAKE_COMPARE || '{}');
const key = match[1] + '...' + match[2];
const status = statuses[key] ?? (match[1].startsWith('refs/heads/') ? process.env.FAKE_COMPARE_DEFAULT : undefined);
if (!status) process.exit(8);
process.stdout.write(status + '\\n');
`,
    { mode: 0o755 }
  );
  return sandbox;
}

let gateRuns = 0;
// Runs the inline trust step exactly as written in the workflow.
function runGate(
  step,
  github,
  { compare = {}, compareDefault, tipSha, trees = {} } = {}
) {
  const dir = gateSandbox();
  gateRuns += 1;
  const eventPath = path.join(dir, `event-${gateRuns}.json`);
  const outputPath = path.join(dir, `output-${gateRuns}`);
  fs.writeFileSync(eventPath, JSON.stringify(github.event ?? {}));
  fs.writeFileSync(outputPath, '');
  const stepEnv = Object.fromEntries(
    Object.entries(step.env ?? {}).map(([key, value]) => [
      key,
      text(renderTemplate(value, scopeFor(github))),
    ])
  );
  const result = spawnSync('bash', ['-c', step.run], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}${path.delimiter}${process.env.PATH}`,
      ...stepEnv,
      FAKE_COMPARE: JSON.stringify(compare),
      FAKE_COMPARE_DEFAULT: compareDefault ?? '',
      FAKE_TIP_SHA: tipSha ?? '',
      FAKE_TREES: JSON.stringify(trees),
      GITHUB_EVENT_NAME: text(github.event_name),
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REF: text(github.ref),
      GITHUB_REPOSITORY: text(github.repository),
      GITHUB_REPOSITORY_ID: text(github.repository_id),
      GITHUB_SHA: text(github.sha),
    },
  });
  const outputs = Object.fromEntries(
    fs
      .readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ])
  );
  return {
    ok: result.status === 0,
    outputs,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

// Jobs that would reach their privileged steps for this event. A job is
// skipped when its `if` is false or a needed job did not succeed (without a
// forcing status function). With gate 'pass' only the expression layer is
// modelled and the trust step is assumed to succeed for the event's own SHA;
// with gate 'run' the trust step really runs and may fail the job.
function runningJobs(workflow, github, { gate = 'pass', ...gateOptions } = {}) {
  const results = {};
  const jobs = Object.entries(workflow.jobs);
  for (let pass = 0; pass <= jobs.length; pass += 1) {
    for (const [id, job] of jobs) {
      if (results[id]) continue;
      const needs = [job.needs ?? []].flat();
      if (needs.some((need) => !results[need])) continue;
      const forced = /\b(always|failure|cancelled)\(\)/u.test(
        String(job.if ?? '')
      );
      const needsScope = Object.fromEntries(
        needs.map((need) => [need, results[need]])
      );
      const admitted =
        (forced || needs.every((need) => results[need].result === 'success')) &&
        (job.if === undefined ||
          evaluateIf(job.if, github, { needs: needsScope }));
      if (!admitted) {
        results[id] = { outputs: {}, result: 'skipped' };
        continue;
      }
      const step = triggerStep(job);
      let stepOutputs = {};
      if (step && gate === 'run') {
        const run = runGate(step, github, gateOptions);
        if (!run.ok) {
          results[id] = { outputs: {}, result: 'failure' };
          continue;
        }
        stepOutputs = run.outputs;
      } else if (step) {
        stepOutputs = {
          head_sha: github.event?.workflow_run?.head_sha ?? github.sha,
          trusted: 'true',
        };
      }
      const steps = { trigger: { outputs: stepOutputs } };
      results[id] = {
        outputs: Object.fromEntries(
          Object.entries(job.outputs ?? {}).map(([key, value]) => [
            key,
            text(
              renderTemplate(
                value,
                scopeFor(github, { needs: needsScope, steps })
              )
            ),
          ])
        ),
        result: 'success',
      };
    }
  }
  return jobs
    .map(([id]) => id)
    .filter((id) => results[id]?.result === 'success');
}

// workflow_run matches upstream workflows by name, and a fork PR can add a
// workflow with any name and run it on pull_request from a branch named after
// any protected branch. Every consumer is therefore fork-reachable, whatever
// its real upstream's triggers are; head_branch and branch filters never prove
// trust. Both the event and the head repository must be checked.
const spoofedCompletions = {
  'fork pull request': { event: 'pull_request' },
  'fork head repository': { event: 'push' },
  'fork head repository workflow_run': { event: 'workflow_run' },
  'fork head repository workflow_dispatch': { event: 'workflow_dispatch' },
  'deleted fork pull request': { event: 'pull_request', head_repository: null },
  'deleted fork push': { event: 'push', head_repository: null },
  'same-repository pull request': {
    event: 'pull_request',
    head_repository: { full_name: repository },
  },
};

// Recompute-only consumers deliberately accept fork-reachable completions as
// a wake-up signal. They hold no secrets, run only default-branch code and
// re-read all state through the API, so they are excluded from the trust-gate
// suites and held to those invariants by workflow-run-trust.test.js instead.
const recomputeOnlyConsumers = new Set(['security-review-reclassify.yaml']);

function workflowRunConsumers(all = loadWorkflows()) {
  return all.flatMap(({ file, workflow }) => {
    const trigger = triggersOf(workflow).workflow_run;
    if (trigger === undefined || recomputeOnlyConsumers.has(file)) return [];
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

// Parses TRUSTED_PRODUCERS lines of every trust step in a workflow.
function trustedProducers(workflow) {
  return Object.values(workflow.jobs).flatMap((job) => {
    const step = triggerStep(job);
    return String(step?.env?.TRUSTED_PRODUCERS ?? '')
      .split('\n')
      .map((line) => line.trim().split(/\s+/u))
      .filter((fields) => fields.length === 5)
      .map(([file, id, branch, events, conclusions]) => ({
        branch,
        conclusions: conclusions.split(','),
        events: events.split(','),
        file,
        id: Number(id),
      }));
  });
}

module.exports = {
  attacker,
  completion,
  dispatch,
  evaluateIf,
  headSha,
  loadWorkflows,
  recomputeOnlyConsumers,
  repository,
  repositoryId,
  runGate,
  runningJobs,
  spoofFailures,
  spoofedCompletions,
  triggerStep,
  triggersOf,
  trustedProducers,
  workflowRunConsumers,
};
