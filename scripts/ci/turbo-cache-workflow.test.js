// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are literal workflow inputs.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const name = 'turbo-cache-cloudflare.yaml';
const runtime =
  'node --test apps/turbo-cache/scripts/verify-worker-runtime.mjs';

test('cache changes and runtime harness changes select automatic Worker qualification', () => {
  const workflow = readWorkflow(name);
  for (const event of ['pull_request', 'push']) {
    for (const file of [
      'apps/turbo-cache/src/worker.ts',
      'scripts/ci/cf-vite-worker.mjs',
      'scripts/ci/cf-worker-parity.mjs',
      'scripts/ci/turbo-cache-workflow.test.js',
      'scripts/ci/run-with-backoff.sh',
      `.github/workflows/${name}`,
      'tuturuuu.ci.ts',
      'bun.lock',
      'package.json',
    ]) {
      assert.ok(
        workflow.on[event].paths.some((pattern) =>
          path.matchesGlob(file, pattern)
        ),
        `${event}: ${file}`
      );
    }
  }
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.equal(workflow.jobs['check-ci'].with.workflow_name, name);
  const decision = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `import { getWorkflowDecision } from './tuturuuu.ts'; console.log(JSON.stringify(getWorkflowDecision({ workflowName: '${name}', changedFiles: ['apps/turbo-cache/src/worker.ts'], eventName: 'pull_request' })));`,
      ],
      { encoding: 'utf8' }
    )
  );
  assert.equal(decision.shouldRun, true);
});

test('exact PR head is built without cache and accepted in workerd before artifact upload', () => {
  const workflow = readWorkflow(name);
  const job = workflow.jobs['build-acceptance'];
  assert.equal(job.needs, 'check-ci');
  assert.equal(job.if, "needs.check-ci.outputs.should_run == 'true'");
  const steps = job.steps;
  const checkout = steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(
    checkout.with.ref,
    '${{ github.event.pull_request.head.sha || github.sha }}'
  );
  assert.equal(checkout.with['persist-credentials'], false);
  const index = (run) => steps.findIndex((step) => step.run === run);
  const build = index('bun run build');
  assert.ok(
    build >
      index('bash scripts/ci/run-with-backoff.sh bun install --frozen-lockfile')
  );
  assert.equal(steps[build]['working-directory'], 'apps/turbo-cache');
  for (const run of [
    'bun run type-check',
    'bun run lint',
    'bun run format:check',
    'bun run test --maxWorkers=2',
  ]) {
    assert.ok(index(run) > 0 && index(run) < build, run);
  }
  const source = steps.findIndex(
    (step) => step.run === runtime && !step.env?.TURBO_CACHE_TEST_BUILD_OUTPUT
  );
  const emitted = steps.findIndex(
    (step) =>
      step.run === runtime && step.env?.TURBO_CACHE_TEST_BUILD_OUTPUT === '1'
  );
  const upload = steps.findIndex((step) =>
    step.uses?.startsWith('actions/upload-artifact@')
  );
  assert.ok(source > 0 && source < build);
  assert.ok(emitted > build && upload > emitted);
  assert.equal(steps[upload].with['if-no-files-found'], 'error');
  assert.equal(
    steps[upload].with.name,
    'turbo-cache-worker-${{ github.event.pull_request.head.sha || github.sha }}'
  );
});

test('qualification has read-only credentials and no publication path', () => {
  const workflow = readWorkflow(name);
  assert.deepEqual(workflow.permissions, {
    contents: 'read',
    deployments: 'read',
  });
  assert.deepEqual(workflow.jobs['build-acceptance'].permissions, {
    contents: 'read',
  });
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [
    'build-acceptance',
    'check-ci',
  ]);
  assert.equal(Object.hasOwn(workflow.on, 'pull_request_target'), false);
  const serialized = JSON.stringify(workflow);
  assert.doesNotMatch(serialized, /secrets\.|cf deploy|wrangler deploy/);
  for (const step of workflow.jobs['build-acceptance'].steps) {
    if (step.uses && !step.uses.startsWith('./'))
      assert.match(step.uses, /@[a-f0-9]{40}$/);
  }
});
