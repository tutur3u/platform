import assert from 'node:assert/strict';
import { test } from 'node:test';
import { admit } from './wave1-web-admit.mjs';

const sha = 'f'.repeat(40);
const admission = JSON.stringify({
  schema: 1,
  app: 'web-next',
  sourceSha: sha,
  vercelProjectIdEnv: 'VERCEL_WEB_STAGING_PROJECT_ID',
  target: 'staging',
  maxDeploysPerSha: 1,
});
const env = {
  NEXT_ADMISSION: admission,
  GITHUB_REPOSITORY: 'fixture/repo',
  GH_TOKEN: 'gh',
};
const runs = (list) => async () => Response.json({ check_runs: list });
const run = (patch = {}) => ({
  name: 'candidate',
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
  ...patch,
});

test('admits an exact SHA whose candidate qualification is green', async () => {
  assert.deepEqual(await admit({ env, sha, fetcher: runs([run()]) }), {
    candidateRuns: 1,
  });
});
for (const [label, list, override] of [
  ['no candidate run', []],
  ['a failed candidate', [run(), run({ conclusion: 'failure' })]],
  ['a pending candidate', [run({ status: 'in_progress', conclusion: null })]],
  ['a candidate for another SHA', [run({ head_sha: '0'.repeat(40) })]],
  [
    'an admission for another SHA',
    [run()],
    { NEXT_ADMISSION: admission.replace(sha, '0'.repeat(40)) },
  ],
]) {
  test(`refuses ${label}`, async () => {
    await assert.rejects(
      admit({ env: { ...env, ...override }, sha, fetcher: runs(list) })
    );
  });
}
