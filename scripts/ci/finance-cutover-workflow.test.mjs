import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('Finance cutover builds both existing profiles with environment-specific public keys', () => {
  const output = execFileSync(
    'bun',
    [
      '-e',
      `console.log(JSON.stringify(Bun.YAML.parse(await Bun.file('.github/workflows/finance-cloudflare.yaml').text())))`,
    ],
    { encoding: 'utf8' }
  );
  const workflow = JSON.parse(output);
  const job = workflow.jobs['cutover-build'];
  assert.deepEqual(job.strategy.matrix.profile, ['staging', 'production']);
  assert.equal(job.env.VITE_FINANCE_NATIVE_PROFILE, '${{ matrix.profile }}');
  assert.match(job.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, /vars\[format/);
  assert.equal(job.env.NEXT_PUBLIC_WEB_APP_URL, undefined);
  assert.equal(job.env.NEXT_PUBLIC_SUPABASE_URL, undefined);
  assert.ok(
    job.steps.some((step) => step.with?.name?.startsWith('finance-cutover-'))
  );
  assert.ok(
    job.steps.some((step) =>
      step.run?.includes('finance-native-artifact.py pack')
    )
  );
});
