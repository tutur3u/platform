import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { publicInputsDigest } from './wave1-native-artifact.mjs';
import {
  assertMainReleaseAdmission,
  assertReceiptDigest,
  assertReleaseInputs,
  assertRestoredReleaseSeal,
  FIXTURE_PUBLIC_INPUTS_SHA256,
  MAIL_PRODUCTION_HOST,
  stampReleaseSeal,
} from './wave1-release-inputs.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/wave1-native-production.yaml', import.meta.url),
  'utf8'
);
const fixtureUrl = 'https://wave1-ci.supabase.invalid';
const fixtureKey = 'sb_publishable_wave1_ci_placeholder';
const mailUrl = `https://${MAIL_PRODUCTION_HOST}`;
const mailKey = 'sb_publishable_mail_production';

function evaluate(expression, scope) {
  const source = expression
    .replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '')
    .replace(/needs\.([\w-]+)/g, 'needs["$1"]');
  return vm.runInNewContext(source, scope, { timeout: 100 });
}

function jobIf(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, name);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n  [^ \n]/);
  const slice = rest.slice(0, next === -1 ? rest.length : next);
  const match = slice.match(/\n    if: (.*)\n/);
  assert.ok(match, `${name} if`);
  return match[1];
}

test('release-artifact builds only the exact main commit and never publishes', () => {
  assert.match(workflow, /release-artifact:\n/);
  assert.match(workflow, /source-sha:\n/);
  assert.match(workflow, /stampReleaseSeal/);
  assert.doesNotMatch(workflow, /mail-cloudflare\.yaml/);
  const sha = 'a'.repeat(40);
  const needs = {
    'production-policy': { outputs: { allowed: 'true' } },
    'release-admission': { result: 'success' },
  };
  const mainRelease = {
    inputs: {
      app: 'mail',
      'release-artifact': true,
      'source-sha': sha,
    },
    needs,
    github: { ref: 'refs/heads/main', sha },
    cancelled: () => false,
  };
  assert.equal(evaluate(jobIf('release-admission'), mainRelease), true);
  assert.equal(evaluate(jobIf('production-policy'), mainRelease), false);
  assert.equal(evaluate(jobIf('qualify'), mainRelease), true);
  assert.equal(evaluate(jobIf('publish'), mainRelease), false);

  const productionRelease = {
    ...mainRelease,
    github: { ref: 'refs/heads/production', sha },
  };
  assert.equal(evaluate(jobIf('qualify'), productionRelease), false);
  assert.equal(evaluate(jobIf('publish'), productionRelease), false);
  assert.equal(evaluate(jobIf('production-policy'), productionRelease), false);

  const mainSync = {
    ...mainRelease,
    inputs: { app: 'mail', 'release-artifact': false, 'source-sha': sha },
  };
  assert.equal(evaluate(jobIf('qualify'), mainSync), false);
  assert.equal(evaluate(jobIf('publish'), mainSync), false);
  assert.equal(evaluate(jobIf('production-policy'), mainSync), false);

  const productionPublish = {
    ...mainRelease,
    inputs: { app: 'mail', 'release-artifact': false, 'source-sha': '' },
    github: { ref: 'refs/heads/production', sha },
  };
  assert.equal(evaluate(jobIf('qualify'), productionPublish), true);
  assert.equal(evaluate(jobIf('publish'), productionPublish), true);
  productionPublish.needs['production-policy'].outputs.allowed = 'false';
  assert.equal(evaluate(jobIf('qualify'), productionPublish), false);
  assert.equal(evaluate(jobIf('publish'), productionPublish), false);
});

test('mail release inputs fail closed and agree with the sealed digest', () => {
  assert.throws(
    () => assertReleaseInputs({ APP: 'mail', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey }),
    /Production public inputs are required/
  );
  assert.throws(
    () => assertReleaseInputs({ APP: 'mail', NEXT_PUBLIC_SUPABASE_URL: mailUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }),
    /Production public inputs are required/
  );
  assert.throws(
    () => assertReleaseInputs({
      APP: 'mail',
      NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
    }),
    /Fixture production public inputs are refused/
  );
  assert.equal(
    publicInputsDigest({
      NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
    }),
    FIXTURE_PUBLIC_INPUTS_SHA256
  );
  const wrong = {
    APP: 'mail',
    NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
  };
  assert.throws(
    () => assertReleaseInputs(wrong),
    (error) => {
      assert.match(error.message, /admitted host/);
      assert.equal(error.message.includes('other.supabase.co'), false);
      assert.equal(error.message.includes(mailKey), false);
      return true;
    }
  );
  const sha = 'b'.repeat(40);
  const env = {
    APP: 'mail',
    RELEASE_ARTIFACT: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    REQUESTED_SHA: sha,
    INPUT_ENVIRONMENT: 'wave1-mail-production',
    NEXT_PUBLIC_SUPABASE_URL: mailUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
  };
  const digest = assertReleaseInputs(env);
  assert.notEqual(digest, FIXTURE_PUBLIC_INPUTS_SHA256);
  const sealed = stampReleaseSeal({ sha, publicInputsSha256: digest }, env);
  assert.deepEqual(
    { sourceSha: sealed.sourceSha, inputEnvironment: sealed.inputEnvironment },
    { sourceSha: sha, inputEnvironment: 'wave1-mail-production' }
  );
  assert.equal(assertReceiptDigest(sealed, env), digest);
  assert.throws(
    () => assertReceiptDigest({ sha, publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256, sourceSha: sha, inputEnvironment: 'wave1-mail-production' }, env),
    /does not match the production build inputs/
  );
  assert.throws(
    () => assertMainReleaseAdmission({ ...env, GITHUB_REF: 'refs/heads/production' }),
    /only on refs\/heads\/main/
  );
  assert.throws(
    () => assertMainReleaseAdmission({ ...env, REQUESTED_SHA: 'c'.repeat(40) }),
    /does not match this main commit/
  );
  const restoredEnv = { ...env };
  delete restoredEnv.NEXT_PUBLIC_SUPABASE_URL;
  delete restoredEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal(assertRestoredReleaseSeal(sealed, restoredEnv), digest);
  assert.throws(
    () => assertRestoredReleaseSeal({ ...sealed, publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256 }, restoredEnv),
    /Fixture publicInputsSha256 is refused/
  );
  assert.match(workflow, /assertReceiptDigest/);
  assert.match(workflow, /assertReleaseInputs/);
  assert.match(workflow, /assertMainReleaseAdmission/);
});
