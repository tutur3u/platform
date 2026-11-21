const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { evaluateExpression } = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('vercel-production.yaml');
const { plan } = workflow.jobs;
const [admission, ...planningSteps] = plan.steps;
const sha = 'a'.repeat(40);

function admit(t, overrides) {
  const dir = mkdtempSync(path.join(tmpdir(), 'planner-admission-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'output');
  const summary = path.join(dir, 'summary');
  const calls = path.join(dir, 'calls');
  for (const file of [output, summary, calls]) writeFileSync(file, '');
  writeFileSync(
    path.join(dir, 'gh'),
    '#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALLS"\nprintf "%s\\n" "$COMPARISON"\nexit "$API_EXIT"\n',
    { mode: 0o755 }
  );
  const result = spawnSync('bash', ['-c', admission.run], {
    cwd: dir,
    env: {
      PATH: `${dir}${path.delimiter}${process.env.PATH}`,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/production',
      GITHUB_SHA: sha,
      GITHUB_REPOSITORY: 'tutur3u/platform',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      EXPECTED_SHA: '',
      CALLS: calls,
      COMPARISON: 'identical',
      API_EXIT: '0',
      ...overrides,
    },
  });
  assert.ifError(result.error);
  return {
    status: result.status,
    output: readFileSync(output, 'utf8').trim(),
    summary: readFileSync(summary, 'utf8'),
    calls: readFileSync(calls, 'utf8').trim(),
  };
}

test('queued production pushes compare the source SHA against the protected production ref', (t) => {
  const result = admit(t, {});
  assert.equal(result.status, 0);
  assert.equal(result.output, 'superseded=false');
  assert.equal(
    result.calls,
    `api repos/tutur3u/platform/compare/refs/heads/production...${sha}?per_page=1 --jq .status`
  );
});

test('a superseded push skips checkout, setup, target selection, and all reusable deploy jobs', (t) => {
  assert.equal(admission.id, 'admission');
  const result = admit(t, { COMPARISON: 'behind' });
  assert.equal(result.status, 0);
  assert.equal(result.output, 'superseded=true');
  assert.match(result.summary, new RegExp(`Skipped ${sha}`));
  const scope = { steps: { admission: { outputs: { superseded: 'true' } } } };
  assert.ok(planningSteps.some((step) => step.id === 'plan'));
  for (const step of planningSteps) {
    assert.equal(evaluateExpression(step.if, scope), false, step.name);
  }
  assert.equal(evaluateExpression(plan.outputs.workflows_json, scope), '[]');
  const skipped = {
    needs: {
      plan: { outputs: { workflows_json: '[]', superseded: 'true' } },
    },
  };
  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    if (!job.uses) continue;
    assert.equal(evaluateExpression(job.if, skipped), false, jobId);
  }
});

test('unproven push ancestry and invalid trigger identities fail closed', (t) => {
  for (const overrides of [
    { COMPARISON: 'ahead' },
    { COMPARISON: 'diverged' },
    { COMPARISON: '' },
    { API_EXIT: '1' },
    { GITHUB_REF: 'refs/heads/Production' },
    { GITHUB_SHA: 'bad-sha' },
    { GITHUB_SHA: 'a'.repeat(39) },
    { GITHUB_SHA: 'A'.repeat(40) },
    { GITHUB_EVENT_NAME: 'pull_request' },
  ]) {
    const result = admit(t, overrides);
    assert.equal(result.status, 1, JSON.stringify(overrides));
    assert.equal(result.output, '');
  }
});

test('manual recovery keeps its exact SHA constraint and shares the non-cancelling queue', (t) => {
  assert.deepEqual(workflow.concurrency, {
    group: 'production-deployment-planner-${{ github.ref }}',
    'cancel-in-progress': false,
    queue: 'max',
  });
  const github = { ref: 'refs/heads/production', sha };
  assert.equal(
    evaluateExpression(plan.if, { github, inputs: { expected_sha: sha } }),
    true
  );
  assert.equal(
    evaluateExpression(plan.if, {
      github,
      inputs: { expected_sha: 'b'.repeat(40) },
    }),
    false
  );
  const result = admit(t, {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    API_EXIT: '1',
  });
  assert.equal(result.status, 0);
  assert.equal(result.output, 'superseded=false');
  assert.equal(result.calls, '');
  for (const expected of [sha, sha.toUpperCase(), 'b'.repeat(40)]) {
    const manual = admit(t, {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      EXPECTED_SHA: expected,
    });
    assert.equal(manual.status, expected === sha ? 0 : 1);
    assert.equal(manual.calls, '');
  }
  const scope = {
    steps: {
      admission: { outputs: { superseded: 'false' } },
      plan: {
        outputs: { workflows_json: '["tasks-cloudflare.yaml"]' },
      },
    },
  };
  for (const step of planningSteps) {
    assert.equal(evaluateExpression(step.if, scope), true, step.name);
  }
  assert.equal(
    evaluateExpression(plan.outputs.workflows_json, scope),
    scope.steps.plan.outputs.workflows_json
  );
});
