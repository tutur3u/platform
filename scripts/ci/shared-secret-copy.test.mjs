// Static contract for .github/workflows/shared-secret-copy.yaml: dispatch on
// the production branch only, one job per source environment, a read-only token, existing
// action pins, and the copied value only in one variable and on stdin.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SECRET_VALUE } from './shared-secret-api.mjs';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper.js');

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(here, '../../.github/workflows');
const FILE = 'shared-secret-copy.yaml';
const text = readFileSync(join(workflowsDir, FILE), 'utf8');
const workflow = readWorkflow(FILE, { raw: true });

const JOBS = {
  'copy-repo-secret': {
    environment: 'colab-production',
    when: "inputs.secret != 'MEET_REALTIME_TOKEN_SECRET'",
    sources: [
      ['CRON_CONTROL_DELIVERY_TOKEN', 'CRON_CONTROL_DELIVERY_TOKEN'],
      ['TUTURUUU_DEVBOX_CONTROL_TOKEN', 'DEVBOX_CONTROL_INTERNAL_TOKEN'],
    ],
  },
  'copy-meet': {
    environment: 'meet-cloudflare-production',
    when: "inputs.secret == 'MEET_REALTIME_TOKEN_SECRET'",
    sources: [],
  },
};

test('dispatch only, with one choice input', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  const { secret } = workflow.on.workflow_dispatch.inputs;
  assert.equal(secret.type, 'choice');
  assert.deepEqual(secret.options, [
    'MEET_REALTIME_TOKEN_SECRET',
    'CRON_CONTROL_DELIVERY_TOKEN',
    'TUTURUUU_DEVBOX_CONTROL_TOKEN',
  ]);
  assert.ok(!/pull_request|fork/.test(text));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(workflow.jobs).sort(), Object.keys(JOBS).sort());
});

function existingPins() {
  const pins = new Set();
  for (const file of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(file) || file === FILE) continue;
    const other = readFileSync(join(workflowsDir, file), 'utf8');
    for (const [, pin] of other.matchAll(/uses:\s*(\S+@[0-9a-f]{40})\b/g))
      pins.add(pin);
  }
  return pins;
}

for (const [name, spec] of Object.entries(JOBS)) {
  const job = workflow.jobs[name];
  const steps = job.steps;
  const secretStep = steps.at(-1);
  const script = secretStep.run;

  test(`${name}: production branch only, its environment, no job-wide credentials`, () => {
    assert.equal(
      job.if,
      `github.ref == 'refs/heads/production' && ${spec.when}`
    );
    assert.equal(job.environment, spec.environment);
    assert.equal(job.permissions, undefined);
    assert.equal(job.env, undefined);
    assert.equal(steps[0].run, 'test "$GITHUB_REF" = refs/heads/production');
    const checkout = steps.find((step) =>
      step.uses?.startsWith('actions/checkout')
    );
    assert.equal(checkout.with['persist-credentials'], false);
    const known = existingPins();
    for (const step of steps.filter((item) => item.uses))
      assert.ok(known.has(step.uses), `${step.uses} is not an existing pin`);
    for (const step of steps.slice(0, -1))
      assert.ok(!JSON.stringify(step).includes('secrets.'));
    for (const step of steps.filter((item) => item.run))
      assert.ok(!step.run.includes('${{'), 'pass values through env');
  });

  test(`${name}: Workers Scripts token and exactly its own sources`, () => {
    assert.equal(
      secretStep.env.CLOUDFLARE_API_TOKEN,
      '$' + '{{ secrets.WEB_OPENNEXT_CLOUDFLARE_API_TOKEN }}'
    );
    assert.equal(
      secretStep.env.CLOUDFLARE_ACCOUNT_ID,
      'e8912e2867beecc673d171907bf09649'
    );
    for (const [input, source] of spec.sources)
      assert.ok(
        secretStep.env.SOURCE_VALUE.includes(
          `(inputs.secret == '${input}' && secrets.${source})`
        )
      );
    if (name === 'copy-meet')
      assert.equal(
        secretStep.env.SOURCE_VALUE,
        '$' + '{{ secrets.MEET_REALTIME_TOKEN_SECRET }}'
      );
    else assert.ok(!secretStep.env.SOURCE_VALUE.includes('MEET_REALTIME'));
  });

  test(`${name}: the value stays in one variable and on stdin`, () => {
    assert.ok(script.startsWith('set -euo pipefail\nset +x\n'));
    assert.ok(
      !/set -x|--value|--text|--token|echo|tee|>>|GITHUB_(?:ENV|OUTPUT)/.test(
        script
      )
    );
    const lines = script.trim().split('\n');
    const steps = lines.filter(
      (line) => !line.startsWith('#') && !line.startsWith('set ')
    );
    // The source leaves the environment before any node process starts, and
    // its shape is checked before the mask command sees it.
    assert.deepEqual(steps, [
      'value="$SOURCE_VALUE"',
      'unset SOURCE_VALUE',
      "shape='^[A-Za-z0-9+/=._-]+$'",
      `[[ "$value" =~ $shape ]] && (( \${#value} >= 32 && \${#value} <= 512 )) || { printf 'source value has an unexpected shape\\n' >&2; exit 1; }`,
      `printf '::add-mask::%s\\n' "$value"`,
      'node scripts/ci/shared-secret.mjs preflight "$SHARED_SECRET" production web',
      `printf '%s' "$value" | node scripts/ci/shared-secret.mjs write workers "$SHARED_SECRET" production web`,
      'unset value',
      'node scripts/ci/shared-secret.mjs verify "$SHARED_SECRET" production web',
    ]);
    assert.ok(!script.includes('write vercel'), 'a copy never touches Vercel');
  });

  test(`${name}: the bash shape check matches assertSecretValue`, () => {
    const shape = script.match(/shape='([^']+)'/)[1];
    const [, min, max] = script.match(
      /\(\( \$\{#value\} >= (\d+) && \$\{#value\} <= (\d+) \)\)/
    );
    assert.equal(
      shape.replace(/\+\$$/, `{${min},${max}}$`),
      SECRET_VALUE.source
    );
  });
}
