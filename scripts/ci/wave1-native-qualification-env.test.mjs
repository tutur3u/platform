import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper.js');
const workflow = readWorkflow('wave1-native-app.yaml');
function selected(expression, profile, ref, event) {
  assert.equal(typeof expression, 'string');
  assert.ok(expression.startsWith('${{') && expression.endsWith('}}'));
  return runInNewContext(
    expression.slice(3, -2),
    {
      matrix: { profile },
      inputs: { app: 'calendar' },
      github: { ref, event_name: event },
      vars: {
        STAGING_SUPABASE_URL: 'https://staging.example.test',
        STAGING_SUPABASE_PUBLISHABLE_KEY: 'public-staging-key',
      },
    },
    { timeout: 1000 }
  );
}
for (const profile of ['staging', 'production'])
  for (const ref of [
    'refs/heads/main',
    'refs/heads/feature/test',
    'refs/pull/1/merge',
  ])
    for (const event of [
      'push',
      'workflow_dispatch',
      'pull_request',
      'pull_request_target',
    ])
      test(`${profile} qualification public inputs stay scoped for ${ref} ${event}`, () => {
        const trusted =
          ref === 'refs/heads/main' &&
          ['push', 'workflow_dispatch'].includes(event);
        assert.equal(
          selected(
            workflow.jobs.build.env.NEXT_PUBLIC_SUPABASE_URL,
            profile,
            ref,
            event
          ),
          trusted && profile === 'staging'
            ? 'https://staging.example.test'
            : 'https://wave1-ci.supabase.invalid'
        );
        assert.equal(
          selected(
            workflow.jobs.build.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            profile,
            ref,
            event
          ),
          trusted && profile === 'staging'
            ? 'public-staging-key'
            : 'sb_publishable_wave1_ci_placeholder'
        );
      });
test('qualification has no protected environment or forwarded credentials', () => {
  assert.equal(workflow.on.workflow_call.secrets, undefined);
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job.environment, undefined);
    assert.equal(job.secrets, undefined);
    assert.equal(JSON.stringify(job).includes('secrets.'), false);
  }
  for (const [file, jobId] of [
    ['calendar-cloudflare.yaml', 'native-profiles'],
    ['mail-cloudflare.yaml', 'native-profiles'],
    ['apps-cloudflare.yaml', 'native-publication-profiles'],
  ])
    assert.equal(readWorkflow(file).jobs[jobId].secrets, undefined, file);
});
for (const name of ['build', 'restored'])
  test(`${name} qualification executes the upload-size guard after runtime acceptance`, () => {
    const steps = workflow.jobs[name].steps;
    const guards = steps.filter((step) =>
      step.run?.includes('wave1-native-publish.mjs dry-run')
    );
    assert.equal(guards.length, 1);
    assert.equal(
      guards[0].run.trim().split('\n')[0],
      'node scripts/ci/wave1-native-publish.mjs dry-run "$APP" "$PROFILE" "$SOURCE_SHA"'
    );
    assert.equal(guards[0]['working-directory'], undefined);
    const runtime = steps.findIndex((step) =>
      step.run?.includes('wave1-native-runtime.mjs')
    );
    assert.ok(runtime >= 0 && runtime < steps.indexOf(guards[0]));
  });
