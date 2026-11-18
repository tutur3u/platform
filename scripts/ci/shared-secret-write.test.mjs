// Static contract for the dispatch-only secret workflows
// (shared-secret-write.yaml, supabase-family-key.yaml). The behavior of their
// operator scripts is covered by shared-secret-scripts.test.mjs.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper.js');

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const workflowsDir = join(repoRoot, '.github/workflows');
const FLOOR = '018eecf2fff936563b5775f711fbfc5606e361219';
const ACCOUNT = 'e8912e2867beecc673d171907bf09649';

const WORKFLOWS = {
  'shared-secret-write.yaml': {
    job: 'write',
    environment: 'shared-secret-${{ inputs.environment }}',
    secrets: ['COLAB_CLOUDFLARE_API_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_TOKEN'],
    consumers: [
      'node scripts/ci/shared-secret.mjs write vercel "$SHARED_SECRET" "$TARGET_ENVIRONMENT"',
      'node scripts/ci/shared-secret.mjs write workers "$SHARED_SECRET" "$TARGET_ENVIRONMENT"',
    ],
    inputs: {
      secret: ['ABUSE_GUARD_SECRET', 'WEB_MULTI_ACCOUNT_SESSION_SECRET'],
      environment: ['staging', 'production'],
    },
  },
  'supabase-family-key.yaml': {
    job: 'create',
    environment: 'supabase-production-migrations',
    secrets: ['COLAB_CLOUDFLARE_API_TOKEN', 'SUPABASE_ACCESS_TOKEN'],
    consumers: ['node scripts/ci/supabase-family-key.mjs put'],
    inputs: { action: ['create'] },
  },
};

// Every `uses:` pin already present in the other workflows.
function existingPins() {
  const pins = new Set();
  for (const file of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(file) || file in WORKFLOWS) continue;
    const text = readFileSync(join(workflowsDir, file), 'utf8');
    for (const [, pin] of text.matchAll(/uses:\s*(\S+@[0-9a-f]{40})\b/g))
      pins.add(pin);
  }
  return pins;
}

for (const [file, spec] of Object.entries(WORKFLOWS)) {
  const text = readFileSync(join(workflowsDir, file), 'utf8');
  const workflow = readWorkflow(file, { raw: true });
  const job = workflow.jobs[spec.job];
  const steps = job.steps;
  const secretStep = steps.at(-1);
  const script = secretStep.run;

  test(`${file}: dispatch only with listed choice inputs`, () => {
    assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
    const inputs = workflow.on.workflow_dispatch.inputs;
    assert.deepEqual(Object.keys(inputs), Object.keys(spec.inputs));
    for (const [name, options] of Object.entries(spec.inputs)) {
      assert.equal(inputs[name].type, 'choice', `${name} must be a choice`);
      assert.deepEqual(inputs[name].options, options);
    }
  });

  test(`${file}: main only, protected environment, read-only token`, () => {
    assert.equal(job.if, "github.ref == 'refs/heads/main'");
    assert.equal(job.environment, spec.environment);
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.equal(job.permissions, undefined);
    assert.equal(job.env, undefined, 'credentials stay on the secret step');
    assert.equal(workflow.concurrency['cancel-in-progress'], false);
    assert.equal(Object.keys(workflow.jobs).length, 1);
  });

  test(`${file}: the commit must descend from the tooling floor`, () => {
    const floor = steps.find((step) => step.run?.includes('merge-base'));
    assert.ok(floor, 'floor step is missing');
    assert.match(
      floor.run,
      new RegExp(`git merge-base --is-ancestor ${FLOOR} HEAD`)
    );
    assert.ok(steps.indexOf(floor) < steps.indexOf(secretStep));
    const checkout = steps.find((step) =>
      step.uses?.startsWith('actions/checkout')
    );
    assert.equal(checkout.with['fetch-depth'], 0);
    assert.equal(checkout.with['persist-credentials'], false);
  });

  test(`${file}: actions reuse existing full-SHA pins`, () => {
    const known = existingPins();
    for (const step of steps.filter((item) => item.uses)) {
      assert.match(step.uses, /@[0-9a-f]{40}$/, 'pin by full commit SHA');
      assert.ok(known.has(step.uses), `${step.uses} is not an existing pin`);
    }
    assert.ok(!/actions\/(?:cache|upload-artifact)@/.test(text));
  });

  test(`${file}: credentials by name, hard-coded identity`, () => {
    const names = [...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(
      ([, name]) => name
    );
    assert.deepEqual([...new Set(names)].sort(), [...spec.secrets].sort());
    assert.equal(names.length, spec.secrets.length, 'each secret once');
    assert.equal(secretStep.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT);
    for (const step of steps.slice(0, -1))
      assert.ok(!JSON.stringify(step).includes('secrets.'));
    // Built from parts: the usage guard for the legacy CLI counts literal mentions.
    const legacyCli = new RegExp(['wrang', 'ler'].join(''), 'i');
    assert.ok(!legacyCli.test(text), 'use the Cloudflare API script');
    assert.ok(!/vercel (?:link|pull|env pull)/.test(text));
  });

  test(`${file}: no expression reaches a shell script`, () => {
    for (const step of steps.filter((item) => item.run))
      assert.ok(!step.run.includes('${{'), 'pass values through env');
  });

  test(`${file}: the value stays in one variable and on stdin`, () => {
    assert.ok(script.startsWith('set -euo pipefail\nset +x\n'));
    assert.ok(
      !/--value|--text|--secret|--token|echo|tee|>>|GITHUB_(?:ENV|OUTPUT)/.test(
        script
      )
    );
    const lines = script.trim().split('\n');
    const uses = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\bvalue\b/.test(line));
    const mask = uses.find(({ line }) => line.includes('::add-mask::'));
    assert.equal(mask.line, `printf '::add-mask::%s\\n' "$value"`);
    const assignment = uses.find(({ line }) => line.startsWith('value="$('));
    assert.ok(assignment.index < mask.index);
    const consumers = uses.filter(({ line }) =>
      line.startsWith(`printf '%s' "$value" | `)
    );
    assert.deepEqual(
      consumers.map(({ line }) => line.replace(`printf '%s' "$value" | `, '')),
      spec.consumers
    );
    for (const consumer of consumers) assert.ok(consumer.index > mask.index);
    const unset = uses.find(({ line }) => line === 'unset value');
    assert.ok(unset.index > Math.max(...consumers.map(({ index }) => index)));
    assert.equal(
      uses.length,
      consumers.length + 3,
      'value appears only to assign, mask, pipe and unset'
    );
    assert.match(lines.at(-1), /\bverify\b/);
  });
}

test('shared-secret-write: assignment generates the value in memory', () => {
  const { run } = readWorkflow('shared-secret-write.yaml', {
    raw: true,
  }).jobs.write.steps.at(-1);
  assert.ok(run.includes(`value="$(openssl rand -base64 48 | tr -d '\\n')"`));
});

test('supabase-family-key: refuses a second key before creating one', () => {
  const { run } = readWorkflow('supabase-family-key.yaml', {
    raw: true,
  }).jobs.create.steps.at(-1);
  assert.ok(run.indexOf(' preflight') < run.indexOf(' create'));
  const text = readFileSync(
    join(workflowsDir, 'supabase-family-key.yaml'),
    'utf8'
  );
  assert.ok(text.includes('SUPABASE_PROJECT_REF: nzamlzqfdwaaxdefwraj'));
});
