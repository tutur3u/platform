// Provider-neutral, offline phase implementation. No CLI or HTTP transport.
import { runStage } from './calendar-exact-sha-publisher.mjs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CALENDAR_VERCEL } from './release-vercel-config.mjs';
import { payloadDigest } from './release-vercel-queue.mjs';
import { executeVercelPhase } from './release-vercel-queue.mjs';

import { ReleaseStop } from './release-vercel-errors.mjs';
export { RELEASE_CODES, ReleaseStop } from './release-vercel-errors.mjs';
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
export function verifyProductionAncestry(sha, ref) {
  if (!/^[a-f0-9]{40}$/u.test(sha) || ref !== CALENDAR_RELEASE_MODES.promoteRef)
    return false;
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/production'],
    { encoding: 'utf8' }
  );
  return result.status === 0;
}
export function releaseConfigForApp(app) {
  if (app !== 'calendar') fail('RELEASE_CONFIG_INVALID', 'inputs');
  return CALENDAR_RELEASE_MODES;
}
export function runningReleaseDigests(app = 'calendar') {
  const config = releaseConfigForApp(app);
  const recipe = createHash('sha256');
  for (const file of [
    'release-vercel-modes.mjs',
    'release-vercel-queue.mjs',
    'release-vercel-errors.mjs',
    'release-vercel-config.mjs',
    'release-vercel-values.mjs',
    'calendar-exact-sha-publisher.mjs',
    'calendar-exact-sha-output.mjs',
    'calendar-exact-sha-stop.mjs',
  ]) {
    const bytes = readFileSync(new URL(file, import.meta.url));
    recipe
      .update(`${Buffer.byteLength(file)}:${file}:${bytes.length}:`)
      .update(bytes);
  }
  return {
    configSha256: payloadDigest({
      vercel: CALENDAR_VERCEL,
      modes: validateReleaseModes(config),
    }),
    recipeSha256: recipe.digest('hex'),
  };
}
function bindReceipt(payload, config, receipt, context, mode) {
  const actual = runningReleaseDigests(config.app);
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    ['c1', 'staticAuth', 'delta', 'qualification'].some(
      (key) => receipt.qualification?.[key] !== 'passed'
    ) ||
    receipt.status !== 'succeeded' ||
    receipt.phase !== (mode === 'promote' ? 'stage' : 'promote') ||
    context.predecessorSha256 !== payloadDigest(receipt) ||
    !context.approvalVerificationId ||
    receipt.alias !== config.alias ||
    receipt.projectId !== payload.target.project ||
    receipt.sourceSha !== payload.sourceSha ||
    receipt.configSha256 !== payload.configSha256 ||
    receipt.recipeSha256 !== payload.recipeSha256 ||
    actual.configSha256 !== payload.configSha256 ||
    actual.recipeSha256 !== payload.recipeSha256 ||
    !hex.test(receipt.artifactSha256) ||
    receipt.artifactSha256 !== payload.artifact?.sha256 ||
    receipt.candidate?.id !== payload.artifact?.id ||
    !deployment.test(receipt.candidate?.id) ||
    !deployment.test(receipt.preimage?.id) ||
    receipt.preimage.id !== payload.rollback.deploymentId ||
    receipt.preimage.id === receipt.candidate.id ||
    !receipt.canonicalTarget ||
    ['provider', 'account', 'project', 'app', 'alias'].some(
      (k) => receipt.canonicalTarget[k] !== payload.target[k]
    )
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
function approval(payload, config, permission, context) {
  // The injected authority resolves and verifies these references against
  // protected environment rules; a caller boolean never grants approval.
  if (
    payload.target.environment !== config.promoteEnvironment ||
    !payload.authorizationRefs.includes(
      `environment:${config.promoteEnvironment}`
    ) ||
    !context.approval ||
    context.approval.permission !== permission ||
    !payload.authorizationRefs.includes(context.approval.reference) ||
    context.approval.sourceSha !== payload.sourceSha ||
    context.approval.environment !== config.promoteEnvironment ||
    context.approval.predecessorSha256 !== context.predecessorSha256 ||
    (permission === 'rollback' &&
      context.approval.reference !== payload.rollback.authorizationRef)
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
  sourceRef = process.env.GITHUB_REF,
  verifySourceAncestry = verifyProductionAncestry,
}) {
  config = validateReleaseModes(config);
  const { payload } = context;
  if (
    !['promote', 'watch', 'rollback'].includes(mode) ||
    payload.requestedPhases[0] !== mode
  )
    fail('RELEASE_CONFIG_INVALID', 'inputs');
  receipt = context.predecessor;
  bindReceipt(payload, config, receipt, context, mode);
  await context.checkFence();
  if (mode === 'promote' || mode === 'rollback') {
    approval(
      payload,
      config,
      mode === 'promote' ? 'rex-promote' : 'rollback',
      context
    );
    if (sourceRef !== config.promoteRef)
      fail('RELEASE_APPROVAL_REQUIRED', 'approval');
    if (
      typeof verifySourceAncestry !== 'function' ||
      (await verifySourceAncestry(payload.sourceSha, config.promoteRef)) !==
        true
    )
      fail('RELEASE_RECEIPT_MISMATCH', 'source-ancestry');
    await context.checkFence();
    const from =
      mode === 'promote' ? receipt.preimage.id : receipt.candidate.id;
    const to = mode === 'promote' ? receipt.candidate.id : receipt.preimage.id;
    const before = await provider.inspectAlias(config.alias);
    await context.checkFence();
    if (before?.id !== to) aliasMatches(before, from, payload, config);
    else aliasMatches(before, to, payload, config);
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
    // Vercel alias set has no CAS: expectedCurrentId is advisory. The
    // authority alias lock provides exclusion across stage/production envs.
    if (before.id !== to)
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
      lifecycle: {
        candidate: receipt.candidate,
        preimage: receipt.preimage,
        alias: receipt.alias,
        projectId: receipt.projectId,
        qualification: receipt.qualification,
        artifactSha256: receipt.artifactSha256,
      },
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
  let failures = 0,
    previous = start,
    samples = 0;
  const end = start + config.watchDurationMs;
  async function waitUntil(deadline) {
    for (let attempt = 0; now() < deadline; attempt++) {
      if (attempt >= 100) fail('RELEASE_WATCH_EXPIRED', 'watch');
      await delay(Math.ceil(deadline - now()) + 1);
      await context.checkFence();
    }
  }
  for (let index = 0; index < config.maxSamples; index++) {
    const offset = (index * config.watchDurationMs) / config.maxSamples;
    if (offset + config.probeTimeoutMs > config.watchDurationMs && samples > 0)
      break;
    await waitUntil(start + offset);
    await context.checkFence();
    const before = now();
    if (!Number.isFinite(before) || before < previous)
      fail('RELEASE_PROBE_INVALID', 'watch');
    if (before >= end && samples > 0) break;
    // Every started probe gets its full budget. At most one probe timeout may
    // extend past the observation deadline due to scheduling delay.
    const result = await boundedProbe(probe, config.probeTimeoutMs);
    await context.checkFence();
    samples++;
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
    previous = now();
    if (
      !Number.isFinite(previous) ||
      previous < before ||
      previous > end + config.probeTimeoutMs
    )
      fail('RELEASE_WATCH_EXPIRED', 'watch');
  }
  await waitUntil(end);
  if (!samples) fail('RELEASE_PROBE_INVALID', 'watch');
  return {
    terminalState: 'watched',
    samples,
    deploymentId: receipt.candidate.id,
  };
}

async function dispatch(options, runtime) {
  const mode = options.payload?.requestedPhases?.[0];
  if (!['stage', 'promote', 'watch', 'rollback'].includes(mode))
    fail('RELEASE_CONFIG_INVALID', 'inputs');
  const config = releaseConfigForApp(options.payload.target.app);
  if (
    options.config !== undefined &&
    payloadDigest(options.config) !== payloadDigest(config)
  )
    fail('RELEASE_CONFIG_INVALID', 'inputs');
  const actual = runningReleaseDigests(config.app);
  if (
    options.payload.configSha256 !== actual.configSha256 ||
    options.payload.recipeSha256 !== actual.recipeSha256
  )
    fail('RELEASE_RECEIPT_MISMATCH', 'inputs');
  const reviewedTarget =
    mode === 'stage'
      ? options.reviewedTarget
      : {
          ...options.receipt?.canonicalTarget,
          environment: config.promoteEnvironment,
        };
  return executeVercelPhase({
    port: options.port,
    payload: options.payload,
    host: options.host,
    reviewedTarget,
    execute: async (context) => {
      if (mode === 'stage') {
        let preimage;
        const deps = options.stageDependencies;
        if (
          !deps ||
          deps.projectId !== context.payload.target.project ||
          options.payload.target.environment !==
            CALENDAR_VERCEL.stageEnvironment
        )
          fail('RELEASE_CONFIG_INVALID', 'inputs');
        const staged = await runStage({
          ...deps,
          recordPreimage: async (value) => {
            if (value.id !== context.payload.rollback.deploymentId)
              fail('RELEASE_RECEIPT_MISMATCH', 'alias-preimage');
            preimage = value;
            await deps.recordPreimage(value);
          },
          stage: (seal) =>
            context.effect('stage-upload', () => deps.stage(seal)),
        });
        if (
          staged.source !== context.payload.sourceSha ||
          preimage?.id !== context.payload.rollback.deploymentId
        )
          fail('RELEASE_RECEIPT_MISMATCH', 'stage');
        const lifecycle = await context.qualifyLifecycle({
          candidate: { id: staged.staged.id },
          preimage: { id: preimage.id },
          alias: config.alias,
          projectId: context.payload.target.project,
          artifactSha256: staged.seal,
        });
        return {
          deploymentId: staged.staged.id,
          terminalState: 'staged',
          lifecycle,
        };
      }
      return runReleaseMode({
        mode,
        config,
        context,
        provider: options.provider,
        probe: options.probe,
        sourceRef: runtime.sourceRef,
        verifySourceAncestry: runtime.verifySourceAncestry,
        now: runtime.now,
        delay: runtime.delay,
      });
    },
  });
}
export async function dispatchReleaseMode(options) {
  return dispatch(options, {
    sourceRef: process.env.GITHUB_REF,
    verifySourceAncestry: verifyProductionAncestry,
    now: () => performance.now(),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}
// Node's test runner context is required; caller options cannot activate hooks.
export async function dispatchReleaseModeForTest(options, hooks) {
  if (
    !process.env.NODE_TEST_CONTEXT ||
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  )
    fail('RELEASE_CONFIG_INVALID', 'test-hook');
  return dispatch(options, hooks);
}
