import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function assertHostedOwner(env) {
  assert.equal(
    env.GITHUB_ACTIONS,
    'true',
    'Requires a disposable hosted runner'
  );
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/u);
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/u);
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.SUPABASE_ACCESS_TOKEN, undefined);
}

export async function profilePreflight({
  env,
  expectedHead,
  run,
  checkPort,
  record,
}) {
  let stage = 'hosted-owner';
  try {
    assertHostedOwner(env);
    stage = 'expected-head';
    assert.match(expectedHead ?? '', /^[a-f0-9]{40}$/u);
    const sha = (await run('git', ['rev-parse', 'HEAD'])).trim();
    assert.equal(sha, expectedHead);
    stage = 'source-status';
    assert.equal((await run('git', ['status', '--porcelain'])).trim(), '');
    stage = 'foreign-containers';
    assert.equal(
      (await run('docker', ['ps', '-aq'])).trim(),
      '',
      'Disposable runner already contains foreign containers'
    );
    stage = 'port-availability';
    for (const port of [
      8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 7803, 7833, 8443,
    ])
      await checkPort(port);
    stage = 'source-index';
    const indexHash = createHash('sha256')
      .update(await run('git', ['ls-files', '-s']))
      .digest('hex');
    return { sha, indexHash };
  } catch (error) {
    try {
      await record({
        phase: 'preflight',
        stage,
        outcome: 'FAIL',
        fixtureStarted: false,
        deploymentProof: false,
        productionProof: false,
      });
    } catch (receiptError) {
      throw new AggregateError(
        [error, receiptError],
        'Preflight and receipt failed'
      );
    }
    throw error;
  }
}
