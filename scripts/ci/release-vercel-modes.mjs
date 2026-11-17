// Provider-neutral, offline phase implementation. No CLI or HTTP transport.
import { executeVercelPhase } from './release-vercel-queue.mjs';

export const RELEASE_CODES = Object.freeze([
  'RELEASE_CONFIG_INVALID',
  'RELEASE_RECEIPT_MISMATCH',
  'RELEASE_APPROVAL_REQUIRED',
  'RELEASE_ALIAS_MISMATCH',
  'RELEASE_PROBE_INVALID',
  'RELEASE_WATCH_EXPIRED',
]);
export class ReleaseStop extends Error {
  constructor(code, phase) {
    super(code);
    if (!RELEASE_CODES.includes(code))
      throw new TypeError('Unknown release guard');
    this.guardCode = code;
    this.guardPhase = phase;
  }
}
const fail = (code, phase) => {
  throw new ReleaseStop(code, phase);
};
const hex = /^[a-f0-9]{64}$/u;
const deployment = /^dpl_[A-Za-z0-9_]{3,100}$/u;
export const CALENDAR_RELEASE_MODES = Object.freeze({
  app: 'calendar',
  alias: 'calendar.tuturuuu.com',
  promoteEnvironment: 'vercel-production-calendar',
  promoteRef: 'refs/heads/production',
  watchDurationMs: 60_000,
  probeTimeoutMs: 5_000,
  maxSamples: 12,
  maxErrorRate: 0.01,
  maxSmokeFailures: 1,
});
export function validateReleaseModes(config) {
  const keys = Object.keys(CALENDAR_RELEASE_MODES);
  if (
    !config ||
    Object.keys(config).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(config, k)) ||
    config.app !== 'calendar' ||
    config.alias !== 'calendar.tuturuuu.com' ||
    config.promoteEnvironment !== 'vercel-production-calendar' ||
    config.promoteRef !== 'refs/heads/production' ||
    !Number.isSafeInteger(config.watchDurationMs) ||
    config.watchDurationMs <= 0 ||
    config.watchDurationMs > 900_000 ||
    !Number.isSafeInteger(config.probeTimeoutMs) ||
    config.probeTimeoutMs <= 0 ||
    config.probeTimeoutMs > 30_000 ||
    !Number.isSafeInteger(config.maxSamples) ||
    config.maxSamples <= 0 ||
    config.maxSamples > 100 ||
    !Number.isFinite(config.maxErrorRate) ||
    config.maxErrorRate < 0 ||
    config.maxErrorRate > 1 ||
    !Number.isSafeInteger(config.maxSmokeFailures) ||
    config.maxSmokeFailures < 1 ||
    config.maxSmokeFailures > config.maxSamples
  )
    fail('RELEASE_CONFIG_INVALID', 'inputs');
  return Object.freeze({ ...config });
}
function bindReceipt(payload, config, receipt) {
  if (
    !receipt ||
    receipt.alias !== config.alias ||
    receipt.projectId !== payload.target.project ||
    receipt.sourceSha !== payload.sourceSha ||
    receipt.configSha256 !== payload.configSha256 ||
    receipt.recipeSha256 !== payload.recipeSha256 ||
    !hex.test(receipt.artifactSha256) ||
    receipt.artifactSha256 !== payload.artifact?.sha256 ||
    receipt.candidate?.id !== payload.artifact?.id ||
    !deployment.test(receipt.candidate?.id) ||
    !deployment.test(receipt.preimage?.id) ||
    receipt.preimage.id !== payload.rollback.deploymentId ||
    receipt.preimage.id === receipt.candidate.id
  )
    fail('RELEASE_RECEIPT_MISMATCH', 'inputs');
}
function aliasMatches(live, id, payload, config) {
  if (
    live?.id !== id ||
    live.projectId !== payload.target.project ||
    live.readyState !== 'READY' ||
    !Array.isArray(live.aliases) ||
    !live.aliases.includes(config.alias)
  )
    fail('RELEASE_ALIAS_MISMATCH', 'alias-readback');
}
function approval(payload, config, permission) {
  // The injected authority resolves and verifies these references against
  // protected environment rules; a caller boolean never grants approval.
  if (
    payload.target.environment !== config.promoteEnvironment ||
    !payload.authorizationRefs.includes(
      `environment:${config.promoteEnvironment}`
    ) ||
    !payload.authorizationRefs.some((v) => v.startsWith(`${permission}:`))
  )
    fail('RELEASE_APPROVAL_REQUIRED', 'approval');
}
async function boundedProbe(probe, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      probe({ signal: controller.signal, timeoutMs }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ReleaseStop('RELEASE_WATCH_EXPIRED', 'watch'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function runReleaseMode({
  mode,
  config,
  receipt,
  context,
  provider,
  probe,
  now = () => performance.now(),
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  sourceRef,
}) {
  config = validateReleaseModes(config);
  const { payload } = context;
  if (
    !['promote', 'watch', 'rollback'].includes(mode) ||
    payload.requestedPhases[0] !== mode
  )
    fail('RELEASE_CONFIG_INVALID', 'inputs');
  bindReceipt(payload, config, receipt);
  await context.checkFence();
  if (mode === 'promote' || mode === 'rollback') {
    approval(payload, config, mode === 'promote' ? 'rex-promote' : 'rollback');
    if (sourceRef !== config.promoteRef)
      fail('RELEASE_APPROVAL_REQUIRED', 'approval');
    const from =
      mode === 'promote' ? receipt.preimage.id : receipt.candidate.id;
    const to = mode === 'promote' ? receipt.candidate.id : receipt.preimage.id;
    const before = await provider.inspectAlias(config.alias);
    await context.checkFence();
    aliasMatches(before, from, payload, config);
    // Read candidate/preimage identity before mutation; the recorded preimage
    // is the only rollback target, regardless of caller-supplied host labels.
    const target = await provider.inspectDeployment(to);
    await context.checkFence();
    if (
      target?.id !== to ||
      target.projectId !== payload.target.project ||
      target.readyState !== 'READY' ||
      (mode === 'promote' &&
        (target.sourceSha !== payload.sourceSha ||
          target.outputSeal !== receipt.artifactSha256))
    )
      fail('RELEASE_RECEIPT_MISMATCH', 'target-readback');
    await context.effect('set-alias', () =>
      provider.setAlias({
        alias: config.alias,
        deploymentId: to,
        expectedCurrentId: from,
        operationId: payload.operationId,
      })
    );
    const after = await provider.inspectAlias(config.alias);
    await context.checkFence();
    aliasMatches(after, to, payload, config);
    return {
      terminalState: mode === 'promote' ? 'promoted' : 'rolled-back',
      deploymentId: to,
      alias: config.alias,
      aliasPreimageId: receipt.preimage.id,
      aliasReadbackId: after.id,
    };
  }
  if (typeof probe !== 'function') fail('RELEASE_PROBE_INVALID', 'watch');
  const start = now();
  if (!Number.isFinite(start)) fail('RELEASE_PROBE_INVALID', 'watch');
  let failures = 0;
  let previous = start;
  for (let samples = 1; samples <= config.maxSamples; samples++) {
    await context.checkFence();
    const elapsed = now() - start;
    if (
      !Number.isFinite(elapsed) ||
      elapsed < previous - start ||
      elapsed >= config.watchDurationMs
    )
      fail('RELEASE_WATCH_EXPIRED', 'watch');
    previous = start + elapsed;
    const result = await boundedProbe(
      probe,
      Math.min(config.probeTimeoutMs, config.watchDurationMs - elapsed)
    );
    await context.checkFence();
    if (
      !result ||
      typeof result.smokeOk !== 'boolean' ||
      !Number.isFinite(result.errorRate) ||
      result.errorRate < 0 ||
      result.errorRate > 1 ||
      result.sourceSha !== payload.sourceSha ||
      result.deploymentId !== receipt.candidate.id
    )
      fail('RELEASE_PROBE_INVALID', 'watch');
    if (!result.smokeOk) failures++;
    if (
      result.errorRate > config.maxErrorRate ||
      failures >= config.maxSmokeFailures
    )
      return {
        terminalState: 'rollback-required',
        samples,
        deploymentId: receipt.candidate.id,
        rollbackDeploymentId: receipt.preimage.id,
        reason: result.errorRate > config.maxErrorRate ? 'error-rate' : 'smoke',
      };
    const beforeWait = now();
    if (!Number.isFinite(beforeWait) || beforeWait < previous)
      fail('RELEASE_PROBE_INVALID', 'watch');
    const remaining = config.watchDurationMs - (beforeWait - start);
    if (remaining > 0) {
      await delay(
        Math.min(config.watchDurationMs / config.maxSamples, remaining)
      );
      await context.checkFence();
    }
    const after = now();
    if (!Number.isFinite(after) || after < previous)
      fail('RELEASE_PROBE_INVALID', 'watch');
    previous = after;
    if (after - start >= config.watchDurationMs)
      return {
        terminalState: 'watched',
        samples,
        deploymentId: receipt.candidate.id,
      };
  }
  // Exhausting samples before the configured observation window is incomplete.
  fail('RELEASE_WATCH_EXPIRED', 'watch');
}

export async function dispatchReleaseMode(options) {
  return executeVercelPhase({
    ...options,
    execute: (context) =>
      runReleaseMode({
        ...options,
        mode: options.payload.requestedPhases[0],
        context,
      }),
  });
}
