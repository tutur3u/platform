// Post-publish health gate for wave-1 production uploads. After an upload
// activates a version, public probes must show that version serving: every
// build-info origin reports the uploaded commit and no probe answers 5xx or
// times out, across consecutive rounds. The gate reads public endpoints
// only and needs no credential.
import assert from 'node:assert/strict';
import {
  ConcurrentDeploymentError,
  guardedDeploy,
} from './wave1-production-deployments.mjs';

// The public mounts each app serves today: its canonical host and, where the
// apex gateway mounts it, tuturuuu.com/<app>. Pages are probed without
// following redirects; Apps has no login page, so its home page stands in.
// `mount` is the signed-out answer of the apex mount root: a 307 into
// https://tuturuuu.com/login, or 200 for the public Apps catalog. Drive has
// no apex mount. `runtimeHeader` marks apps whose source emits
// `x-tuturuuu-runtime: native`; the staged smoke requires it there and
// records it elsewhere (wave1-production-health.test.mjs checks the source).
export const HEALTH_TARGETS = {
  mail: {
    buildInfo: ['https://mail.tuturuuu.com', 'https://tuturuuu.com/mail'],
    pages: ['https://mail.tuturuuu.com/login'],
    mount: { url: 'https://tuturuuu.com/mail', status: 307, login: true },
    runtimeHeader: false,
  },
  calendar: {
    buildInfo: [
      'https://calendar.tuturuuu.com',
      'https://tuturuuu.com/calendar',
    ],
    pages: ['https://calendar.tuturuuu.com/login'],
    mount: { url: 'https://tuturuuu.com/calendar', status: 307, login: true },
    runtimeHeader: false,
  },
  apps: {
    buildInfo: ['https://apps.tuturuuu.com', 'https://tuturuuu.com/apps'],
    pages: ['https://apps.tuturuuu.com/'],
    mount: { url: 'https://tuturuuu.com/apps', status: 200, login: false },
    runtimeHeader: false,
  },
  finance: {
    buildInfo: ['https://finance.tuturuuu.com', 'https://tuturuuu.com/finance'],
    pages: ['https://finance.tuturuuu.com/login'],
    mount: { url: 'https://tuturuuu.com/finance', status: 307, login: true },
    runtimeHeader: true,
  },
  drive: {
    buildInfo: ['https://drive.tuturuuu.com'],
    pages: ['https://drive.tuturuuu.com/login'],
    mount: null,
    runtimeHeader: false,
  },
};

export const HEALTH_DEFAULTS = {
  // Six healthy rounds ten seconds apart: about one minute of serving.
  rounds: 6,
  intervalMs: 10_000,
  // Rounds in which the previous commit may still answer while the new
  // version propagates. Any 5xx or timeout fails at once.
  propagationRounds: 6,
  probeTimeoutMs: 10_000,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The longest a health gate run can take: every propagation and healthy
 * round with its interval and a probe timeout. A switch needs this much of
 * the budget left, or the gate would stop at once and roll back.
 */
export function minimumGateMs(options = {}) {
  const { rounds, propagationRounds, intervalMs, probeTimeoutMs } = {
    ...HEALTH_DEFAULTS,
    ...options,
  };
  return (rounds + propagationRounds) * (intervalMs + probeTimeoutMs);
}

export function healthTargets(app) {
  assert.ok(Object.hasOwn(HEALTH_TARGETS, app), `No health targets for ${app}`);
  return HEALTH_TARGETS[app];
}

async function probe(url, { fetcher, timeoutMs, round }) {
  const target = new URL(url);
  target.searchParams.set('ttr-health', String(round));
  try {
    const response = await fetcher(target.href, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return { url, status: response.status, text };
  } catch (error) {
    const timedOut =
      error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { url, error: timedOut ? 'timeout' : 'request failed' };
  }
}

/**
 * The commit and app a build-info body reports. appName proves which Worker
 * answered: a gateway or another app answering the same path from the same
 * commit cannot pass for the app. Build-info carries no version identity.
 */
export function buildIdentity(text) {
  try {
    const info = JSON.parse(text);
    const commit = info.commitHash ?? info.commit;
    return {
      commit: typeof commit === 'string' ? commit : null,
      appName: typeof info.appName === 'string' ? info.appName : null,
    };
  } catch {
    return { commit: null, appName: null };
  }
}

/** One probe of every build-info origin and page. */
export async function probeRound({
  app,
  fetcher,
  timeoutMs = HEALTH_DEFAULTS.probeTimeoutMs,
  round = 0,
}) {
  const { buildInfo, pages } = healthTargets(app);
  const results = await Promise.all([
    ...buildInfo.map(async (origin) => {
      const result = await probe(`${origin}/api/build-info`, {
        fetcher,
        timeoutMs,
        round,
      });
      return { ...result, kind: 'build-info', ...buildIdentity(result.text) };
    }),
    ...pages.map(async (url) => ({
      ...(await probe(url, { fetcher, timeoutMs, round })),
      kind: 'page',
    })),
  ]);
  return results.map(({ text: _text, ...rest }) => rest);
}

function roundFailure(results, app) {
  for (const result of results) {
    if (result.error) return `${result.url} ${result.error}`;
    if (result.status >= 500) return `${result.url} answered ${result.status}`;
    if (result.kind === 'build-info' && result.status !== 200)
      return `${result.url} answered ${result.status}`;
    if (result.kind === 'build-info' && !result.commit)
      return `${result.url} reported no commit`;
    if (result.kind === 'build-info' && result.appName !== app)
      return `${result.url} reports app ${result.appName ?? 'none'}, expected ${app}`;
  }
  return null;
}

/**
 * Probes until `rounds` consecutive healthy rounds pass. With `expected`, every
 * build-info origin must report that commit; before the first full match the
 * previous commit may still answer for up to `propagationRounds` rounds.
 * Returns { healthy, failure?, probes }.
 */
export async function healthGate({
  app,
  expected = null,
  fetcher = fetch,
  sleep = wait,
  rounds = HEALTH_DEFAULTS.rounds,
  intervalMs = HEALTH_DEFAULTS.intervalMs,
  propagationRounds = HEALTH_DEFAULTS.propagationRounds,
  probeTimeoutMs = HEALTH_DEFAULTS.probeTimeoutMs,
  deadlineAt = Number.POSITIVE_INFINITY,
  now = Date.now,
}) {
  const probes = [];
  let healthy = 0;
  let matched = false;
  for (let round = 0; round < propagationRounds + rounds; round += 1) {
    if (round > 0) await sleep(intervalMs);
    if (now() >= deadlineAt)
      return { healthy: false, failure: 'time budget exhausted', probes };
    const results = await probeRound({
      app,
      fetcher,
      timeoutMs: probeTimeoutMs,
      round,
    });
    probes.push({ round, results });
    const failure = roundFailure(results, app);
    if (failure) return { healthy: false, failure, probes };
    const stale = expected
      ? results.find(
          ({ kind, commit }) => kind === 'build-info' && commit !== expected
        )
      : null;
    if (stale) {
      if (matched || round + 1 >= propagationRounds)
        return {
          healthy: false,
          failure: `${stale.url} reports ${stale.commit}, expected ${expected}`,
          probes,
        };
      continue;
    }
    matched = true;
    healthy += 1;
    if (healthy >= rounds) return { healthy: true, probes };
  }
  return { healthy: false, failure: 'health rounds exhausted', probes };
}

/**
 * The splits an attempt with `versionId` may have left active: staged at 0%
 * beside the serving split, or switched to 100%.
 */
export function attemptSplits(record) {
  const serving = (record.rollback?.versions ?? []).map(
    ({ version_id, percentage }) => ({ version_id, percentage })
  );
  return [
    [...serving, { version_id: record.versionId, percentage: 0 }],
    [{ version_id: record.versionId, percentage: 100 }],
  ];
}

/**
 * Restores the recorded rollback deployment, but only over a split this
 * attempt wrote; another writer's deployment raises
 * ConcurrentDeploymentError and nothing is written.
 */
export async function restoreRollback({
  script,
  token,
  record,
  request,
  sleep,
}) {
  assert.ok(
    Array.isArray(record.rollback?.versions) &&
      record.rollback.versions.length > 0,
    'No recorded rollback deployment'
  );
  return guardedDeploy({
    script,
    token,
    request,
    versions: record.rollback.versions,
    owned: attemptSplits(record),
    why: 'Rolling back',
    sleep,
  });
}

/**
 * Runs the health gate on a version this attempt switched traffic to. On
 * failure it restores the recorded rollback deployment with the upload
 * step's own credential, re-probes the restored state, records both outcomes
 * and throws. A rollback that cannot be confirmed marks the receipt
 * uncertain. Never call it for an attempt that did not write a version.
 */
export async function gateOrRollBack({
  app,
  sha,
  record,
  save,
  script,
  token,
  request,
  healthFetcher = fetch,
  sleep = wait,
  options = {},
}) {
  assert.equal(
    record.state,
    'switched',
    'Health gate needs a version this attempt switched traffic to'
  );
  assert.ok(record.versionId, 'Health gate needs the uploaded version');
  const gate = await healthGate({
    app,
    expected: sha,
    fetcher: healthFetcher,
    sleep,
    ...options,
  });
  record.health = gate;
  if (gate.healthy) {
    record.state = 'healthy';
    save();
    return record;
  }
  record.state = 'rolling-back';
  save();
  try {
    await restoreRollback({ script, token, record, request, sleep });
  } catch (error) {
    if (error instanceof ConcurrentDeploymentError) {
      record.state = 'concurrent-change';
      record.concurrent = { active: error.active };
      save();
      throw new Error(
        `Production health gate failed (${gate.failure}); another writer changed the deployment, so nothing was rolled back`
      );
    }
    record.state = 'uncertain';
    record.rollbackResult = {
      state: 'failed',
      error: error instanceof Error ? error.message : 'unknown rollback error',
    };
    save();
    throw new Error(
      `Production health gate failed (${gate.failure}) and rollback to deployment ${record.rollback?.id} FAILED; receipt marked uncertain, owner must restore it`
    );
  }
  record.rollbackResult = {
    state: 'restored',
    deploymentId: record.rollback.id,
  };
  // The restored version's commit is not known here; it must still serve
  // build-info and answer without 5xx or timeouts.
  record.rollbackHealth = await healthGate({
    app,
    expected: null,
    fetcher: healthFetcher,
    sleep,
    ...options,
    // The rollback's re-probe is bounded by its rounds, not the budget.
    deadlineAt: Number.POSITIVE_INFINITY,
    rounds: Math.min(options.rounds ?? HEALTH_DEFAULTS.rounds, 3),
  });
  record.state = 'rolled-back';
  save();
  throw new Error(
    `Production health gate failed (${gate.failure}); rolled back to deployment ${record.rollback.id}${record.rollbackHealth.healthy ? '' : ` and the restored state is also unhealthy (${record.rollbackHealth.failure})`}`
  );
}
