// Move tuturuuu.com gateway traffic to an uploaded version with cf, matching
// the deployment request, readback and non-versioned settings sync of a
// messaged 100% version deployment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION_ID } from './cf-build-output-publisher.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GATEWAY = resolve(ROOT, 'apps/gateway');
export const GATEWAY_WORKER = 'tuturuuu-gateway';
/** Exit code for a rejection that wrote nothing and may be retried. */
export const RETRYABLE_EXIT = 75;
/** The default Durable Object code update strategy sent with deployments. */
const CODE_UPDATE_STRATEGY = { mode: 'deferred', max_delay: 300 };

const pause = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function cfJson(
  args,
  { env = process.env, exec = execFileSync, timeout = 120000 } = {}
) {
  const output = exec(
    env.CF_BIN ?? join(GATEWAY, 'node_modules/.bin/cf'),
    args,
    {
      env: { ...env, CF_SEND_TELEMETRY: 'false' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout,
    }
  );
  return JSON.parse(output);
}

/**
 * The version serving 100% in the active (first) deployment. 0% companions
 * are allowed, as in the gateway snapshot check (gateway-deploy-config.mjs).
 */
export function gatewayServingVersion(deployments) {
  const versions = deployments?.deployments?.[0]?.versions ?? [];
  const serving = versions.filter(({ percentage }) => percentage === 100);
  assert.ok(
    serving.length === 1 &&
      VERSION_ID.test(serving[0].version_id ?? '') &&
      versions.every(
        ({ percentage }) => percentage === 100 || percentage === 0
      ),
    'Expected exactly one gateway version serving 100%'
  );
  return serving[0].version_id;
}

/**
 * Deployment reads lag writes and can fail transiently. Wait, within a fixed
 * deadline, for `confirmations` consecutive reads serving `versionId`.
 */
export function settleGateway(versionId, deps = {}) {
  const {
    sleep = pause,
    now = Date.now,
    deadlineMs = 150000,
    spacing = 5000,
    confirmations = 3,
  } = deps;
  const end = now() + deadlineMs;
  let streak = 0;
  let last = 'unread';
  for (;;) {
    const remaining = end - now();
    if (remaining <= 0)
      throw new Error(
        `serving version did not settle on ${versionId} (last ${last})`
      );
    try {
      last = gatewayServingVersion(
        cfJson(['workers', 'deployments', 'list', '--worker', GATEWAY_WORKER], {
          ...deps,
          timeout: Math.min(30000, remaining),
        })
      );
      streak = last === versionId ? streak + 1 : 0;
    } catch (error) {
      console.warn(`gateway deployment readback: ${error.message}`);
      streak = 0;
    }
    // A confirmation that arrives after the deadline does not count.
    if (streak >= confirmations && now() <= end) return;
    if (now() + spacing >= end)
      throw new Error(
        `serving version did not settle on ${versionId} (last ${last})`
      );
    sleep(spacing);
  }
}

/** A 100% deployment of one version, annotated with its release message. */
export function gatewayDeploymentBody(versionId, message) {
  return {
    strategy: 'percentage',
    versions: [{ version_id: versionId, percentage: 100 }],
    annotations: { 'workers/message': message },
    code_update_strategy: CODE_UPDATE_STRATEGY,
  };
}

export class RetryableDeployError extends Error {}

function errorText(error) {
  return `${error?.stderr ?? ''}\n${error?.stdout ?? ''}\n${error?.message ?? ''}`;
}

/**
 * PATCH the non-versioned script settings a version deployment syncs from the
 * committed config (`observability`). cf has no command for this endpoint.
 */
export async function syncGatewaySettings({
  env = process.env,
  fetchImpl = fetch,
  observability,
} = {}) {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = env;
  assert.match(account ?? '', /^[a-f0-9]{32}$/u, 'Cloudflare account required');
  assert.ok(token, 'Cloudflare API token required');
  if (observability === undefined) return undefined;
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${GATEWAY_WORKER}/script-settings`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ observability }),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    }
  );
  const body = await response.json().catch(() => ({}));
  assert.ok(
    response.ok && body.success,
    `gateway settings sync failed (HTTP ${response.status}, codes ${body.errors?.map(({ code }) => code).join(',') ?? '-'})`
  );
  return body.result;
}

/**
 * Route 100% of gateway traffic to `versionId` once, then sync
 * `deps.observability` (the committed non-versioned settings). A 100146 rejection (the
 * version is not deployable yet) wrote nothing and is retryable. Any other
 * failure is reconciled against the settled serving version before deciding;
 * a successful request is never repeated, only read back until it settles.
 */
export async function serveGatewayVersion({ versionId, message }, deps = {}) {
  assert.ok(VERSION_ID.test(versionId ?? ''), 'invalid gateway version id');
  assert.ok(message, 'deployment message required');
  let accepted = false;
  try {
    cfJson(
      [
        'workers',
        'deployments',
        'create',
        '--worker',
        GATEWAY_WORKER,
        '--body',
        JSON.stringify(gatewayDeploymentBody(versionId, message)),
      ],
      { ...deps, timeout: 60000 }
    );
    accepted = true;
  } catch (error) {
    if (/\b100146\b/u.test(errorText(error)))
      throw new RetryableDeployError(
        `gateway version ${versionId} is not deployable yet (100146)`
      );
    // The request may still have applied; decide on the settled readback.
  }
  // Deployment reads lag writes: wait for the target to settle, never resend.
  try {
    settleGateway(versionId, deps);
  } catch (error) {
    throw new Error(
      accepted
        ? `gateway deployment did not take effect: ${error.message}`
        : `gateway deployment request failed and ${versionId} is not serving`
    );
  }
  await (deps.syncSettings ?? syncGatewaySettings)({
    env: deps.env ?? process.env,
    observability: deps.observability,
  });
  return { worker: GATEWAY_WORKER, versionId };
}
