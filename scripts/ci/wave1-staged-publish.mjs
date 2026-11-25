// Stage, smoke and switch for wave-1 production publication. The upload
// creates a version without traffic. The version is staged beside the
// serving one in a 0% gradual deployment (serving at 100%, new at 0%), which
// makes it part of the current deployment, so Cloudflare's supported
// Cloudflare-Workers-Version-Overrides header can select it on the app's
// public host with the Worker's real bindings and no change to routes,
// workers.dev or preview URLs. Signed-out probes smoke it there. A failed
// smoke restores the serving deployment before any traffic moves; a passing
// one switches 100% to the new version only while the staged deployment is
// still current.
import assert from 'node:assert/strict';
import {
  ConcurrentDeploymentError,
  guardedDeploy,
  splitOf,
} from './wave1-production-deployments.mjs';
import { buildIdentity, healthTargets } from './wave1-production-health.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The switch's worst case: a guard read, the write and up to four readbacks,
// each a request of up to 15 s, with three 2 s sleeps between readbacks.
export const SWITCH_WORST_CASE_MS = 6 * 15_000 + 3 * 2_000;

export const SMOKE_DEFAULTS = {
  // The edge picks a new deployment up within seconds; a minute of retries
  // bounds the wait for the override to reach the staged version.
  reachAttempts: 12,
  reachDelayMs: 5_000,
  probeTimeoutMs: 10_000,
};

// Response headers a smoke record may keep. Bodies are never recorded.
const RECORDED_HEADERS = [
  'cache-control',
  'cf-ray',
  'content-type',
  'location',
  'server',
  'x-tuturuuu-runtime',
];

function recordedHeaders(headers) {
  return Object.fromEntries(
    RECORDED_HEADERS.flatMap((name) => {
      const value = headers?.get(name);
      return value == null ? [] : [[name, value.slice(0, 300)]];
    })
  );
}

async function get(url, { fetcher, override, timeoutMs }) {
  try {
    // Signed out: no cookie or authorization reaches the staged version.
    const response = await fetcher(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
        'Cloudflare-Workers-Version-Overrides': override,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      url,
      status: response.status,
      headers: recordedHeaders(response.headers),
      text: await response.text(),
    };
  } catch (error) {
    const timedOut =
      error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { url, error: timedOut ? 'timeout' : 'request failed' };
  }
}

// What a failure record keeps of a response: status and allowed headers.
function observed(step, result, extra = {}) {
  return {
    step,
    url: result.url,
    ...(result.error
      ? { error: result.error }
      : { status: result.status, headers: result.headers }),
    ...extra,
  };
}

function failureOf(result) {
  if (result.error) return `${result.url} ${result.error}`;
  if (result.status >= 500) return `${result.url} answered ${result.status}`;
  return null;
}

/**
 * The staged-smoke contract, run through the override header against the
 * version staged at 0%. Every build-info origin (the app's public host and
 * its apex mount) must answer 200 with the staged commit, which proves the
 * override reached the staged version on each path; where the app emits it,
 * `x-tuturuuu-runtime: native` must be present. The signed-out apex mount
 * root must answer as recorded (307 into https://tuturuuu.com/login, or 200
 * for Apps), pages must not answer 5xx, and each release-recipe case must
 * match. Records keep statuses and allowed headers, never bodies.
 * Returns { passed, failure?, observations }.
 */
export async function stagedSmoke({
  app,
  sha,
  worker,
  versionId,
  cases = [],
  fetcher = fetch,
  sleep = wait,
  reachAttempts = SMOKE_DEFAULTS.reachAttempts,
  reachDelayMs = SMOKE_DEFAULTS.reachDelayMs,
  probeTimeoutMs = SMOKE_DEFAULTS.probeTimeoutMs,
  deadlineAt = Number.POSITIVE_INFINITY,
  now = Date.now,
}) {
  const override = `${worker}="${versionId}"`;
  const options = { fetcher, override, timeoutMs: probeTimeoutMs };
  const { buildInfo, pages, mount, runtimeHeader } = healthTargets(app);
  const [canonical] = buildInfo;
  const observations = [];
  const fail = (failure) => ({ passed: false, failure, observations });
  let pending = [...buildInfo];
  for (
    let attempt = 1;
    attempt <= reachAttempts && pending.length;
    attempt += 1
  ) {
    if (attempt > 1) await sleep(reachDelayMs);
    if (now() >= deadlineAt) return fail('time budget exhausted');
    const still = [];
    for (const origin of pending) {
      const result = await get(`${origin}/api/build-info`, options);
      const { commit, appName } = buildIdentity(result.text);
      observations.push(
        observed('build-info', result, { attempt, commit, appName })
      );
      const failure = failureOf(result);
      if (failure) return fail(failure);
      if (result.status === 200 && appName !== app)
        return fail(
          `${result.url} reports app ${appName ?? 'none'}, expected ${app}`
        );
      if (result.status !== 200 || commit !== sha) {
        still.push(origin);
        continue;
      }
      const runtime = result.headers['x-tuturuuu-runtime'];
      if (runtimeHeader && runtime !== 'native')
        return fail(
          `${result.url} has x-tuturuuu-runtime ${runtime ?? 'missing'}, expected native`
        );
    }
    pending = still;
  }
  if (pending.length)
    return fail(
      `the override never reached staged version ${versionId} on ${pending.join(', ')}`
    );
  if (mount) {
    const result = await get(mount.url, options);
    observations.push(observed('mount', result));
    const failure = failureOf(result);
    if (failure) return fail(failure);
    if (result.status !== mount.status)
      return fail(
        `${mount.url} answered ${result.status}, expected ${mount.status}`
      );
    if (
      mount.login &&
      !String(result.headers.location ?? '').startsWith(
        'https://tuturuuu.com/login'
      )
    )
      return fail(
        `${mount.url} redirected to ${result.headers.location ?? 'nowhere'}, expected https://tuturuuu.com/login`
      );
  }
  for (const url of pages) {
    const result = await get(url, options);
    observations.push(observed('page', result));
    const failure = failureOf(result);
    if (failure) return fail(failure);
  }
  for (const smokeCase of cases) {
    const result = await get(`${canonical}${smokeCase.path}`, options);
    observations.push(observed('case', result));
    const failure = failureOf(result);
    if (failure) return fail(failure);
    if (result.status !== smokeCase.status)
      return fail(
        `${result.url} answered ${result.status}, expected ${smokeCase.status}`
      );
    if (smokeCase.redirectOrigin) {
      let origin = null;
      try {
        origin = new URL(result.headers.location, result.url).origin;
      } catch {}
      if (origin !== smokeCase.redirectOrigin)
        return fail(
          `${result.url} redirected to ${origin}, expected ${smokeCase.redirectOrigin}`
        );
    }
  }
  return { passed: true, observations };
}

/**
 * Stages the uploaded version at 0%, smokes it and switches traffic to it.
 * Leaves the record `switched`, or throws after restoring the serving
 * deployment (`smoke-failed` or `switch-failed`); a restore that cannot be
 * confirmed marks the record `uncertain`.
 */
export async function stageSmokeSwitch({
  app,
  sha,
  worker,
  record,
  save,
  script,
  token,
  request,
  cases,
  smokeFetcher = fetch,
  sleep = wait,
  smokeOptions = {},
  deadlineAt = Number.POSITIVE_INFINITY,
  gateReserveMs = 0,
  now = Date.now,
}) {
  assert.equal(record.state, 'uploaded-version', 'Stage needs a version');
  assert.ok(record.versionId, 'Stage needs the uploaded version id');
  const serving = splitOf(record.rollback?.versions);
  assert.ok(
    serving.length === 1 && serving[0].percentage === 100,
    'Staging needs one version serving 100%; owner reconciliation required'
  );
  const context = { script, token, request };
  const stage = [serving[0], { version_id: record.versionId, percentage: 0 }];
  const switched = [{ version_id: record.versionId, percentage: 100 }];
  const message = (error) =>
    error instanceof Error ? error.message : 'unknown error';
  // Another writer's deployment is never overwritten: record it and stop.
  const concurrent = (error, failure) => {
    record.state = 'concurrent-change';
    record.concurrent = { active: error.active };
    save();
    return new Error(
      `${failure}; another writer changed the deployment, so this attempt wrote nothing more`
    );
  };
  // Restores the serving deployment only over a split this attempt wrote.
  const restore = async (state, failure) => {
    try {
      await guardedDeploy({
        ...context,
        versions: serving,
        owned: [stage, switched],
        why: failure,
        sleep,
      });
    } catch (error) {
      if (error instanceof ConcurrentDeploymentError)
        throw concurrent(error, failure);
      record.state = 'uncertain';
      record.rollbackResult = { state: 'failed', error: message(error) };
      save();
      throw new Error(
        `${failure}; restoring the serving deployment FAILED, receipt marked uncertain`
      );
    }
    record.state = state;
    save();
    throw new Error(`${failure}; the serving deployment is restored`);
  };
  try {
    await guardedDeploy({
      ...context,
      versions: stage,
      owned: [serving],
      why: 'Serving deployment changed before staging',
      sleep,
    });
  } catch (error) {
    if (error instanceof ConcurrentDeploymentError)
      throw concurrent(error, 'Staging at 0% refused');
    await restore('stage-failed', `Staging at 0% failed (${message(error)})`);
  }
  record.state = 'staged';
  save();
  let smoke;
  try {
    smoke = await stagedSmoke({
      app,
      sha,
      worker,
      versionId: record.versionId,
      cases,
      fetcher: smokeFetcher,
      sleep,
      deadlineAt,
      now,
      ...smokeOptions,
    });
  } catch (error) {
    smoke = {
      passed: false,
      failure: error instanceof Error ? error.message : 'smoke error',
    };
  }
  // Switching with too little budget left would let the health gate stop at
  // once and roll back; treat the shortfall as a failed smoke instead. The
  // reserve covers the switch itself as well as a full gate run.
  const reserveMs = SWITCH_WORST_CASE_MS + gateReserveMs;
  if (smoke.passed && now() + reserveMs > deadlineAt)
    smoke = {
      ...smoke,
      passed: false,
      failure: `too little time budget left for the switch and the health gate (${reserveMs} ms)`,
    };
  record.smoke = smoke;
  save();
  if (!smoke.passed)
    await restore(
      'smoke-failed',
      `Staged smoke failed (${smoke.failure}); no traffic moved`
    );
  try {
    await guardedDeploy({
      ...context,
      versions: switched,
      owned: [stage],
      why: 'Staged deployment changed before the switch',
      sleep,
    });
  } catch (error) {
    if (error instanceof ConcurrentDeploymentError)
      throw concurrent(error, 'Switching traffic refused');
    await restore(
      'switch-failed',
      `Switching traffic failed (${message(error)})`
    );
  }
  record.state = 'switched';
  save();
  return record;
}
