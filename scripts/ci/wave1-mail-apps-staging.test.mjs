import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { productionPublicationHold } from './production-publication-policy.ts';
import { publicInputsDigest } from './wave1-native-artifact.mjs';
import { profiles } from './wave1-native-profile.mjs';
import { publicationAdmission } from './wave1-native-publish.mjs';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper.js');
const sha = 'a'.repeat(40);
for (const app of ['mail', 'apps']) {
  for (const event of ['push', 'workflow_dispatch']) {
    test(`${app} exact staging admission permits ${event} while production stays held`, () => {
      const request = {
        app,
        sha,
        environment: 'staging',
        ref: 'refs/heads/main',
        event,
        stagingEnabled: 'true',
        admissionRecord: JSON.stringify({
          schema: 1,
          app,
          sourceSha: sha,
          artifactSha256: 'b'.repeat(64),
          ...profiles.stagingAdmission,
        }),
      };
      assert.equal(publicationAdmission(request).allowed, true);
      for (const change of [
        { ref: 'refs/heads/feature/test' },
        { event: 'pull_request' },
        { stagingEnabled: 'false' },
        { app: 'shortener' },
        { sha: 'c'.repeat(40) },
        { admissionRecord: undefined },
      ])
        assert.equal(
          publicationAdmission({ ...request, ...change }).allowed,
          false
        );
      for (const workflow of [
        `${app}-cloudflare.yaml`,
        `vercel-production-${app}.yaml`,
      ])
        assert.match(productionPublicationHold(workflow), /held/);
      assert.equal(
        publicationAdmission({
          ...request,
          environment: 'production',
          ref: 'refs/heads/production',
        }).allowed,
        false
      );
    });
  }
  test(`${app} publication uses the qualified public inputs even when secret copies differ`, () => {
    const build = readWorkflow('wave1-native-app.yaml').jobs.build.env;
    const publish = readWorkflow(
      'wave1-native-publish.yaml'
    ).jobs.publish.steps.find((step) =>
      step.run?.includes('wave1-native-publish.mjs publish')
    ).env;
    const context = {
      inputs: { app },
      matrix: { profile: 'staging' },
      github: { ref: 'refs/heads/main', event_name: 'push' },
      vars: {
        STAGING_SUPABASE_URL: 'https://staging.example.test',
        STAGING_SUPABASE_PUBLISHABLE_KEY: 'public-staging-key',
      },
      secrets: {
        STAGING_SUPABASE_URL: 'https://stale.example.test',
        STAGING_SUPABASE_PUBLISHABLE_KEY: 'stale-key',
      },
    };
    const evaluate = (env) =>
      Object.fromEntries(
        [
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        ].map((name) => [
          name,
          runInNewContext(env[name].slice(3, -2), context, { timeout: 1000 }),
        ])
      );
    assert.equal(
      publicInputsDigest(evaluate(build)),
      publicInputsDigest(evaluate(publish))
    );
    assert.equal(
      evaluate(publish).NEXT_PUBLIC_SUPABASE_URL,
      context.vars.STAGING_SUPABASE_URL
    );
    context.inputs.app = 'calendar';
    assert.equal(
      evaluate(publish).NEXT_PUBLIC_SUPABASE_URL,
      context.secrets.STAGING_SUPABASE_URL
    );
    context.inputs.app = app;
    context.vars = {};
    assert.notEqual(
      publicInputsDigest(evaluate(build)),
      publicInputsDigest(evaluate(publish))
    );
  });
}
