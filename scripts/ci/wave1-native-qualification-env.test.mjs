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
      format: (pattern, value) => pattern.replace('{0}', value),
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
      test(`${profile} qualification environment stays scoped for ${ref} ${event}`, () => {
        const trusted =
          ref === 'refs/heads/main' &&
          ['push', 'workflow_dispatch'].includes(event);
        assert.equal(
          selected(workflow.jobs.build.environment, profile, ref, event),
          trusted && profile === 'staging'
            ? 'wave1-calendar-staging'
            : 'wave1-native-source-qualification'
        );
      });
test('staging qualification reads only public inputs and never injects its deploy token', () => {
  assert.equal(workflow.jobs['policy-staging'].environment, undefined);
  const build = JSON.stringify(workflow.jobs.build);
  assert.match(build, /secrets\.STAGING_SUPABASE_URL/u);
  assert.match(build, /secrets\.STAGING_SUPABASE_PUBLISHABLE_KEY/u);
  assert.equal(build.includes('CLOUDFLARE_STAGING_API_TOKEN'), false);
  assert.equal(build.includes('WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN'), false);
});
