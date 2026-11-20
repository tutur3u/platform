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
  new URL(
    '../../.github/workflows/wave1-native-production.yaml',
    import.meta.url
  ),
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
    'production-policy': { result: 'success', outputs: { allowed: 'true' } },
    'release-admission': { result: 'success' },
    qualify: { result: 'success' },
    restored: { result: 'success' },
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
  const failedAdmission = {
    ...mainRelease,
    needs: {
      'production-policy': { outputs: { allowed: 'true' } },
      'release-admission': { result: 'failure' },
    },
  };
  assert.equal(evaluate(jobIf('qualify'), failedAdmission), false);

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
  const skippedAdmission = {
    ...productionPublish,
    needs: {
      ...productionPublish.needs,
      'release-admission': { result: 'skipped' },
    },
  };
  assert.equal(evaluate(jobIf('qualify'), skippedAdmission), true);
  assert.equal(evaluate(jobIf('publish'), skippedAdmission), true);
  for (const prerequisite of ['production-policy', 'qualify', 'restored']) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const blocked = {
        ...skippedAdmission,
        needs: {
          ...skippedAdmission.needs,
          [prerequisite]: { ...skippedAdmission.needs[prerequisite], result },
        },
      };
      assert.equal(
        evaluate(jobIf('publish'), blocked),
        false,
        `publish must block when ${prerequisite} is ${result}`
      );
    }
  }
  assert.equal(
    evaluate(jobIf('publish'), { ...skippedAdmission, cancelled: () => true }),
    false
  );
  productionPublish.needs['production-policy'].outputs.allowed = 'false';
  assert.equal(evaluate(jobIf('qualify'), productionPublish), false);
  assert.equal(evaluate(jobIf('publish'), productionPublish), false);
});

function jobSlice(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, name);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n  [^ \n]/);
  return rest.slice(0, next === -1 ? rest.length : next);
}

function jobField(name, key) {
  const match = jobSlice(name).match(new RegExp(`\\n    ${key}: (.*)\\n`));
  assert.ok(match, `${name} ${key}`);
  return match[1];
}

test('restored follows qualify and publish keeps its production gate', () => {
  const policyIf =
    "${{ github.ref == 'refs/heads/production' && inputs['release-artifact'] != true }}";
  const qualifyIf =
    "${{ !cancelled() && ((inputs['release-artifact'] == true && github.ref == 'refs/heads/main' && needs.release-admission.result == 'success') || (github.ref == 'refs/heads/production' && inputs['release-artifact'] != true && needs.production-policy.outputs.allowed == 'true')) }}";
  const restoredIf = "${{ !cancelled() && needs.qualify.result == 'success' }}";
  assert.equal(jobIf('production-policy'), policyIf);
  assert.equal(jobIf('qualify'), qualifyIf);
  assert.match(jobIf('publish'), /^\$\{\{ !cancelled\(\) && /);
  assert.equal(
    jobField('qualify', 'needs'),
    '[production-policy, release-admission]'
  );
  assert.equal(
    jobField('publish', 'needs'),
    '[production-policy, qualify, restored]'
  );
  assert.equal(jobIf('restored'), restoredIf);
  assert.equal(jobField('restored', 'needs'), 'qualify');
  const restoredJob = jobSlice('restored');
  assert.equal(restoredJob.includes('\n    environment:'), false);
  assert.equal(restoredJob.includes('secrets.'), false);
  assert.equal(restoredJob.includes('secrets['), false);
  assert.equal(restoredJob.includes('NEXT_PUBLIC_SUPABASE'), false);

  const sha = 'c'.repeat(40);
  const scope = (overrides) => ({
    inputs: { app: 'mail', 'release-artifact': true, 'source-sha': sha },
    github: { ref: 'refs/heads/main', sha },
    cancelled: () => false,
    needs: {
      'production-policy': { result: 'skipped', outputs: { allowed: '' } },
      'release-admission': { result: 'success' },
      qualify: { result: 'success' },
    },
    ...overrides,
  });
  const row = (label, current) => {
    const restored = evaluate(jobIf('restored'), current);
    const publish = evaluate(jobIf('publish'), current);
    const line = [
      label,
      `policyIf=${evaluate(jobIf('production-policy'), current) ? 'run' : 'skip'}`,
      `policyResult=${current.needs['production-policy'].result}`,
      `qualifyIf=${evaluate(jobIf('qualify'), current) ? 'run' : 'skip'}`,
      `qualifyResult=${current.needs.qualify.result}`,
      `restored=${restored ? 'run' : 'skip'}`,
      `publish=${publish ? 'run' : 'skip'}`,
    ].join(' ');
    console.log(line);
    return { restored, publish, line };
  };

  const release = row('a release-main qualify-success', scope());
  assert.equal(release.restored, true);
  assert.equal(release.publish, false);
  assert.match(
    release.line,
    /policyIf=skip policyResult=skipped qualifyIf=run qualifyResult=success restored=run publish=skip/
  );

  const failed = row(
    'b release-main qualify-failure',
    scope({
      needs: {
        'production-policy': { result: 'skipped', outputs: { allowed: '' } },
        'release-admission': { result: 'success' },
        qualify: { result: 'failure' },
      },
    })
  );
  assert.equal(failed.restored, false);
  assert.equal(failed.publish, false);
  assert.match(failed.line, /qualifyResult=failure restored=skip publish=skip/);

  const skipped = row(
    'b release-main qualify-skipped',
    scope({
      needs: {
        'production-policy': { result: 'skipped', outputs: { allowed: '' } },
        'release-admission': { result: 'failure' },
        qualify: { result: 'skipped' },
      },
    })
  );
  assert.equal(skipped.restored, false);
  assert.equal(skipped.publish, false);
  assert.match(
    skipped.line,
    /qualifyIf=skip qualifyResult=skipped restored=skip publish=skip/
  );
  assert.equal(
    evaluate(
      jobIf('qualify'),
      scope({
        needs: {
          'production-policy': { result: 'skipped', outputs: { allowed: '' } },
          'release-admission': { result: 'failure' },
          qualify: { result: 'skipped' },
        },
      })
    ),
    false
  );

  const allowed = row(
    'c production policy-allowed',
    scope({
      inputs: { app: 'mail', 'release-artifact': false, 'source-sha': '' },
      github: { ref: 'refs/heads/production', sha },
      needs: {
        'production-policy': {
          result: 'success',
          outputs: { allowed: 'true' },
        },
        'release-admission': { result: 'skipped' },
        qualify: { result: 'success' },
        restored: { result: 'success' },
      },
    })
  );
  assert.equal(allowed.restored, true);
  assert.equal(allowed.publish, true);
  assert.match(
    allowed.line,
    /policyIf=run policyResult=success qualifyIf=run qualifyResult=success restored=run publish=run/
  );

  const denied = row(
    'd production policy-denied',
    scope({
      inputs: { app: 'mail', 'release-artifact': false, 'source-sha': '' },
      github: { ref: 'refs/heads/production', sha },
      needs: {
        'production-policy': {
          result: 'success',
          outputs: { allowed: 'false' },
        },
        'release-admission': { result: 'skipped' },
        qualify: { result: 'skipped' },
      },
    })
  );
  assert.equal(denied.restored, false);
  assert.equal(denied.publish, false);
  assert.match(
    denied.line,
    /policyIf=run policyResult=success qualifyIf=skip qualifyResult=skipped restored=skip publish=skip/
  );

  const policySkipped = row(
    'd production policy-skipped',
    scope({
      inputs: { app: 'mail', 'release-artifact': false, 'source-sha': '' },
      github: { ref: 'refs/heads/production', sha },
      needs: {
        'production-policy': { result: 'skipped', outputs: { allowed: '' } },
        'release-admission': { result: 'skipped' },
        qualify: { result: 'skipped' },
      },
    })
  );
  assert.equal(policySkipped.restored, false);
  assert.equal(policySkipped.publish, false);
  assert.match(
    policySkipped.line,
    /policyResult=skipped qualifyIf=skip qualifyResult=skipped restored=skip publish=skip/
  );

  const cancelled = row(
    'cancelled qualify-success',
    scope({ cancelled: () => true })
  );
  assert.equal(cancelled.restored, false);
  assert.equal(cancelled.publish, false);
  assert.match(
    cancelled.line,
    /qualifyResult=success restored=skip publish=skip/
  );
});

test('mail release inputs fail closed and agree with the sealed digest', () => {
  assert.throws(
    () =>
      assertReleaseInputs({
        APP: 'mail',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
      }),
    /Production public inputs are required/
  );
  assert.throws(
    () =>
      assertReleaseInputs({
        APP: 'mail',
        NEXT_PUBLIC_SUPABASE_URL: mailUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      }),
    /Production public inputs are required/
  );
  assert.throws(
    () =>
      assertReleaseInputs({
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
    () =>
      assertReceiptDigest(
        {
          sha,
          publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256,
          sourceSha: sha,
          inputEnvironment: 'wave1-mail-production',
        },
        env
      ),
    /does not match the production build inputs/
  );
  assert.throws(
    () =>
      assertMainReleaseAdmission({
        ...env,
        GITHUB_REF: 'refs/heads/production',
      }),
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
    () =>
      assertRestoredReleaseSeal(
        { ...sealed, publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256 },
        restoredEnv
      ),
    /Fixture publicInputsSha256 is refused/
  );
  assert.match(workflow, /assertReceiptDigest/);
  assert.match(workflow, /assertReleaseInputs/);
  assert.match(workflow, /assertMainReleaseAdmission/);
});
