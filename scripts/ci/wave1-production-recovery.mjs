// Recovery for an upload step that stopped before it finished: a timeout,
// a cancellation or a crash can leave the new version staged at 0% or
// serving 100% with no rollback. The workflow's recovery step runs this with
// the upload step's own deploy credential when the upload step failed or was
// cancelled. It restores the recorded rollback deployment only over a split
// this attempt wrote; another writer's deployment is recorded and left alone.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boundedJson } from './wave1-native-publish.mjs';
import { ConcurrentDeploymentError } from './wave1-production-deployments.mjs';
import { restoreRollback } from './wave1-production-health.mjs';

// Receipt states in which this attempt may have left its own deployment.
export const RECOVERABLE_STATES = new Set([
  'staged',
  'switched',
  'rolling-back',
]);

export async function recoverPublication({
  app,
  sha,
  env,
  accountId,
  fetcher = fetch,
  sleep,
}) {
  assert.equal(env.GITHUB_REF, 'refs/heads/production');
  assert.equal(env.PUBLICATION_ENVIRONMENT, `wave1-${app}-production`);
  assert.equal(env.GITHUB_SHA, sha);
  const token = env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  assert.ok(token, 'Missing named production credential');
  assert.ok(
    !env.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN &&
      !env.GITHUB_TOKEN &&
      !env.CLOUDFLARE_API_TOKEN &&
      !env.CLOUDFLARE_STAGING_API_TOKEN,
    'Recovery holds only the deploy credential'
  );
  const path = resolve(env.RUNNER_TEMP, `${app}-production-publication.json`);
  if (!existsSync(path)) return { state: 'no-receipt' };
  const record = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(record.app, app);
  assert.equal(record.sha, sha);
  assert.equal(record.runId, env.GITHUB_RUN_ID);
  assert.equal(record.runAttempt, env.GITHUB_RUN_ATTEMPT);
  if (!RECOVERABLE_STATES.has(record.state)) return record;
  const save = () =>
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
  const interrupted = record.state;
  const script = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${record.worker}`;
  try {
    const result = await restoreRollback({
      script,
      token,
      record,
      request: (url, credential, body) =>
        boundedJson(url, credential, fetcher, body),
      sleep,
    });
    record.state = 'rolled-back';
    record.rollbackResult = {
      state: 'restored',
      deploymentId: record.rollback.id,
      by: 'recovery',
      interrupted,
      result,
    };
    save();
    return record;
  } catch (error) {
    if (error instanceof ConcurrentDeploymentError) {
      record.state = 'concurrent-change';
      record.concurrent = { active: error.active, interrupted };
      save();
      throw new Error(
        `Recovery after an interrupted ${interrupted} upload found another writer's deployment; nothing was written`
      );
    }
    record.state = 'uncertain';
    record.rollbackResult = {
      state: 'failed',
      by: 'recovery',
      interrupted,
      error: error instanceof Error ? error.message : 'unknown recovery error',
    };
    save();
    throw new Error(
      `Recovery after an interrupted ${interrupted} upload FAILED; receipt marked uncertain, owner must restore deployment ${record.rollback?.id}`
    );
  }
}
