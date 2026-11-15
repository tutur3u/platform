// SR-951: the Web production deployment refuses to build without a covering
// abuse-guard store, and the gate prints names and store kinds only.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const repoRoot = path.resolve(__dirname, '../..');
const SECRET = 'fixture-secret-value-never-printed-0123456789';

function gate(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuse-store-env-'));
  const file = path.join(dir, '.env.production.local');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  const result = spawnSync(
    'bun',
    ['run', '--silent', 'scripts/ci/verify-abuse-store-env.ts', file],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  fs.rmSync(dir, { force: true, recursive: true });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

test('refuses a production env without any abuse-guard store', () => {
  const result = gate(['VERCEL_ENV="production"', `OTHER_SECRET="${SECRET}"`]);
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /family replay: none/);
  assert.match(result.out, /Refusing to build/);
  assert.doesNotMatch(result.out, new RegExp(SECRET));
});

test('accepts the Upstash pair and never prints its values', () => {
  const result = gate([
    'UPSTASH_REDIS_REST_URL="https://fixture.upstash.invalid"',
    `UPSTASH_REDIS_REST_TOKEN="${SECRET}"`,
  ]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /family replay: upstash/);
  assert.doesNotMatch(result.out, new RegExp(SECRET));
  assert.doesNotMatch(result.out, /fixture\.upstash\.invalid/);
});

test('accepts a complete guard configuration for every family', () => {
  const result = gate([
    'ABUSE_GUARD_URL=https://guard.fixture.invalid',
    `ABUSE_GUARD_SECRET='${SECRET}'`,
    `ABUSE_GUARD_KEY_PEPPER="${SECRET}"`,
    'ABUSE_GUARD_FAMILIES="offline,password,proxy,replay,meet"',
  ]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /family proxy: durable-object/);
  assert.doesNotMatch(result.out, new RegExp(SECRET));
});

test('refuses a partial guard assignment without the Upstash pair', () => {
  const result = gate([
    'ABUSE_GUARD_URL=https://guard.fixture.invalid',
    `ABUSE_GUARD_SECRET="${SECRET}"`,
    `ABUSE_GUARD_KEY_PEPPER="${SECRET}"`,
    'ABUSE_GUARD_FAMILIES=proxy',
  ]);
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /family proxy: durable-object/);
  assert.match(result.out, /family replay: none/);
});

test('refuses when the pulled env file is missing', () => {
  const result = spawnSync(
    'bun',
    [
      'run',
      '--silent',
      'scripts/ci/verify-abuse-store-env.ts',
      path.join(os.tmpdir(), 'abuse-store-env-missing', '.env'),
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
});

test('Web production runs the gate after vercel pull and before the build', () => {
  const { jobs } = readWorkflow('vercel-production-platform.yaml');
  const job = Object.values(jobs).find((candidate) =>
    candidate.steps?.some(
      (step) => step.name === 'Require a covering abuse-guard store'
    )
  );
  assert.ok(job, 'the Web production job runs the abuse-guard store gate');
  const { steps } = job;
  const names = steps.map((step) => step.name);
  const index = names.indexOf('Require a covering abuse-guard store');
  const gateStep = steps[index];
  assert.ok(index > names.indexOf('Pull Vercel Environment Information'));
  assert.ok(index < names.indexOf('Build Project Artifacts'));
  assert.ok(
    index <
      names.indexOf('Stage production artifacts without assigning domains')
  );
  assert.equal(
    gateStep.run,
    'bun run --silent scripts/ci/verify-abuse-store-env.ts .vercel/.env.production.local'
  );
  assert.equal(gateStep['continue-on-error'], undefined);
  // Names only: the gate step receives no secret.
  assert.equal(gateStep.env, undefined);
});
