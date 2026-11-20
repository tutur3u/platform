import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  GATEWAY_WORKER,
  settleGateway,
  gatewayDeploymentBody,
  RetryableDeployError,
  serveGatewayVersion,
  syncGatewaySettings,
} from './gateway-cf-traffic.mjs';

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V3 = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = 'e'.repeat(32);
const gatewayRoot = fileURLToPath(
  new URL('../../apps/gateway', import.meta.url)
);

/**
 * cf fake: `create` applies unless it fails; list lags `lag` reads and fails
 * transiently on the reads listed in `failReads`. Time advances with sleep.
 */
function fakeCf({
  lag = 0,
  createError,
  createApplies = !createError,
  failReads = [],
  companion = false,
} = {}) {
  const calls = [];
  const synced = [];
  let serving = V1;
  let reads = 0;
  let clock = 0;
  const exec = (_bin, args) => {
    calls.push(args);
    if (args[2] === 'create') {
      if (createApplies)
        serving = JSON.parse(args.at(-1)).versions[0].version_id;
      if (createError) throw createError;
      return '{}';
    }
    reads += 1;
    if (failReads.includes(reads))
      throw Object.assign(new Error('cf failed'), { stderr: 'HTTP 502' });
    const current = reads <= lag ? V1 : serving;
    return JSON.stringify({
      deployments: [
        {
          versions: [
            { version_id: current, percentage: 100 },
            ...(companion ? [{ version_id: V3, percentage: 0 }] : []),
          ],
        },
      ],
    });
  };
  return {
    calls,
    synced,
    deps: {
      exec,
      env: { CF_BIN: 'cf-fixture' },
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
      },
      observability: { enabled: true, head_sampling_rate: 0.01 },
      syncSettings: (options) => synced.push(options.observability),
    },
  };
}

const creates = (calls) => calls.filter((args) => args[2] === 'create');

test('serve sends one annotated deployment, waits for it and syncs settings', async () => {
  const cf = fakeCf({ lag: 2 });
  assert.deepEqual(
    await serveGatewayVersion(
      { versionId: V2, message: 'gateway abc' },
      cf.deps
    ),
    { worker: GATEWAY_WORKER, versionId: V2 }
  );
  assert.equal(creates(cf.calls).length, 1);
  assert.deepEqual(creates(cf.calls)[0].slice(0, 5), [
    'workers',
    'deployments',
    'create',
    '--worker',
    GATEWAY_WORKER,
  ]);
  assert.deepEqual(JSON.parse(creates(cf.calls)[0].at(-1)), {
    strategy: 'percentage',
    versions: [{ version_id: V2, percentage: 100 }],
    annotations: { 'workers/message': 'gateway abc' },
    code_update_strategy: { mode: 'deferred', max_delay: 300 },
  });
  assert.deepEqual(cf.synced, [{ enabled: true, head_sampling_rate: 0.01 }]);
});

test('a 100146 rejection is retryable and wrote nothing', async () => {
  const cf = fakeCf({
    createError: Object.assign(new Error('cf failed'), {
      stderr: 'version not found [code: 100146]',
    }),
  });
  await assert.rejects(
    serveGatewayVersion({ versionId: V2, message: 'm' }, cf.deps),
    RetryableDeployError
  );
  assert.deepEqual(cf.synced, []);
});

test('an ambiguous failure is reconciled by readback, never resent', async () => {
  const applied = fakeCf({
    createError: Object.assign(new Error('socket hang up'), { stderr: '' }),
    createApplies: true,
  });
  assert.deepEqual(
    await serveGatewayVersion({ versionId: V2, message: 'm' }, applied.deps),
    { worker: GATEWAY_WORKER, versionId: V2 }
  );
  assert.equal(creates(applied.calls).length, 1);
  // A commit that reads back late still settles without a second request.
  const late = fakeCf({
    createError: Object.assign(new Error('socket hang up'), { stderr: '' }),
    createApplies: true,
    lag: 4,
  });
  await serveGatewayVersion({ versionId: V2, message: 'm' }, late.deps);
  assert.equal(creates(late.calls).length, 1);
  assert.equal(late.synced.length, 1);
  const lost = fakeCf({
    createError: Object.assign(new Error('socket hang up'), { stderr: '' }),
  });
  await assert.rejects(
    serveGatewayVersion({ versionId: V2, message: 'm' }, lost.deps),
    (error) =>
      !(error instanceof RetryableDeployError) &&
      /is not serving/.test(error.message)
  );
  assert.equal(creates(lost.calls).length, 1);
});

test('a deployment that never reads back fails without another write', async () => {
  const cf = fakeCf({ lag: 99 });
  await assert.rejects(
    serveGatewayVersion(
      { versionId: V2, message: 'm' },
      { ...cf.deps, deadlineMs: 20000 }
    ),
    /did not settle on 2{8}-/
  );
  assert.equal(creates(cf.calls).length, 1);
  assert.deepEqual(cf.synced, []);
  await assert.rejects(
    serveGatewayVersion({ versionId: 'v2', message: 'm' }, cf.deps),
    /invalid gateway version id/
  );
});

test('settings sync PATCHes the committed observability only', async () => {
  const requests = [];
  const result = await syncGatewaySettings({
    env: { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: 't' },
    observability: { enabled: true, head_sampling_rate: 0.01 },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: {} }),
      };
    },
  });
  assert.deepEqual(result, {});
  assert.equal(
    requests[0].url,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${GATEWAY_WORKER}/script-settings`
  );
  assert.equal(requests[0].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    observability: { enabled: true, head_sampling_rate: 0.01 },
  });
  await assert.rejects(
    syncGatewaySettings({
      env: { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: 't' },
      observability: { enabled: true },
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        json: async () => ({ success: false, errors: [{ code: 10000 }] }),
      }),
    }),
    /HTTP 403, codes 10000/
  );
});

test('the pinned cf sends the deployment request to the gateway script', () => {
  const output = execFileSync(
    join(gatewayRoot, 'node_modules/.bin/cf'),
    [
      'workers',
      'deployments',
      'create',
      '--worker',
      GATEWAY_WORKER,
      '--dry-run',
      '--body',
      JSON.stringify(gatewayDeploymentBody(V2, 'gateway abc')),
    ],
    {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CF_SEND_TELEMETRY: 'false',
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
        CLOUDFLARE_API_TOKEN: 'dry-run-only',
      },
    }
  );
  const request = JSON.parse(output);
  assert.equal(request.method, 'POST');
  assert.equal(
    request.url,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${GATEWAY_WORKER}/deployments`
  );
  assert.deepEqual(request.query, {});
  assert.deepEqual(request.body, {
    strategy: 'percentage',
    versions: [{ version_id: V2, percentage: 100 }],
    annotations: { 'workers/message': 'gateway abc' },
    code_update_strategy: { mode: 'deferred', max_delay: 300 },
  });
});

test('transient readback failures and 0% companions still settle', async () => {
  const cf = fakeCf({ failReads: [1, 3], companion: true });
  await serveGatewayVersion({ versionId: V2, message: 'm' }, cf.deps);
  assert.equal(creates(cf.calls).length, 1);
  assert.equal(cf.synced.length, 1);
});

test('a confirmation that lands after the deadline does not settle', () => {
  let clock = 0;
  const timeouts = [];
  const exec = (_bin, _args, options) => {
    timeouts.push(options.timeout);
    // Each read takes 2 s; the third ends past the 12 s deadline.
    clock += 2000;
    return JSON.stringify({
      deployments: [{ versions: [{ version_id: V2, percentage: 100 }] }],
    });
  };
  assert.throws(
    () =>
      settleGateway(V2, {
        exec,
        env: { CF_BIN: 'cf-fixture' },
        now: () => clock,
        sleep: (ms) => {
          clock += ms;
        },
        deadlineMs: 12000,
        spacing: 3500,
      }),
    /did not settle on/
  );
  // No read is ever given more time than remains before the deadline.
  assert.deepEqual(timeouts, [12000, 6500, 1000]);
});
