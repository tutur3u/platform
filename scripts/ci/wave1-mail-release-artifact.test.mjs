import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { publicInputsDigest } from './wave1-native-artifact.mjs';
import {
  assertReceiptDigest,
  assertReleaseInputs,
  FIXTURE_PUBLIC_INPUTS_SHA256,
  MAIL_PRODUCTION_HOST,
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

test('release-artifact does not run publish-mail and skips the publication policy', () => {
  assert.match(workflow, /release-artifact:\n/);
  assert.doesNotMatch(workflow, /mail-cloudflare\.yaml/);
  const inputs = { app: 'mail', 'release-artifact': true };
  const needs = {
    'production-policy': { outputs: { allowed: 'true' } },
  };
  const scope = {
    inputs,
    needs,
    github: { ref: 'refs/heads/production' },
    cancelled: () => false,
  };
  assert.equal(evaluate(jobIf('production-policy'), scope), false);
  assert.equal(evaluate(jobIf('qualify'), scope), true);
  assert.equal(evaluate(jobIf('publish'), scope), false);
  scope.inputs = { app: 'mail', 'release-artifact': false };
  scope.needs['production-policy'].outputs.allowed = 'true';
  assert.equal(evaluate(jobIf('publish'), scope), true);
  scope.needs['production-policy'].outputs.allowed = 'false';
  assert.equal(evaluate(jobIf('qualify'), scope), false);
  assert.equal(evaluate(jobIf('publish'), scope), false);
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
  const env = {
    APP: 'mail',
    NEXT_PUBLIC_SUPABASE_URL: mailUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
  };
  const digest = assertReleaseInputs(env);
  assert.notEqual(digest, FIXTURE_PUBLIC_INPUTS_SHA256);
  assert.equal(assertReceiptDigest({ publicInputsSha256: digest }, env), digest);
  assert.throws(
    () => assertReceiptDigest({ publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256 }, env),
    /does not match the production build inputs/
  );
  assert.match(workflow, /assertReceiptDigest/);
  assert.match(workflow, /assertReleaseInputs/);
});
