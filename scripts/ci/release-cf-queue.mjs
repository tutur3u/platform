import assert from 'node:assert/strict';
import { closedRecord } from './release-recipe-config.mjs';
import { performance } from 'node:perf_hooks';
import {
  safeData,
  validateCfPayload,
  cfPhaseKey,
} from './release-cf-queue-payload.mjs';
import { RecipeFailure, failureCause } from './release-cf-queue-errors.mjs';
export {
  cfQueueJob,
  cfPhaseKey,
  payloadDigest,
  recipeDigest,
  submitCfJob,
  stopCfJob,
} from './release-cf-queue-payload.mjs';
export { RecipeFailure } from './release-cf-queue-errors.mjs';

function confirmGrant(previous, current, phase) {
  safeData(current);
  for (const key of ['jobId', 'attemptId', 'workerId', 'targetLockId'])
    if (
      typeof current?.[key] !== 'string' ||
      !/^[A-Za-z0-9:._/-]{1,256}$/.test(current[key])
    )
      throw new RecipeFailure('GRANT_INVALID', phase, 'fence');
  if (
    !Number.isInteger(current?.epoch) ||
    current.epoch < 1 ||
    !Number.isInteger(current?.stopRevision) ||
    current.stopRevision < 0
  )
    throw new RecipeFailure('GRANT_INVALID', phase, 'fence');
  for (const key of [
    'jobId',
    'attemptId',
    'workerId',
    'epoch',
    'targetLockId',
    'stopRevision',
  ]) {
    if (!current?.[key] || (key === 'stopRevision' && current[key] === 0)) {
      if (key !== 'stopRevision' || current?.[key] !== 0)
        throw new RecipeFailure('GRANT_INVALID', phase, 'fence');
    }
    if (current[key] !== previous[key])
      throw new RecipeFailure('STALE_GRANT', phase, 'fence');
  }
  const lease = Date.parse(current.leaseDeadline);
  if (!Number.isFinite(lease) || lease <= Date.now())
    throw new RecipeFailure('LEASE_EXPIRED', phase, 'fence');
  return lease - Date.now();
}
function matchesReceipt(receipt, payload, phase, grant) {
  safeData(receipt);
  closedRecord(receipt, [
    'schemaVersion',
    'jobId',
    'operationId',
    'attemptId',
    'epoch',
    'sourceSha',
    'recipeSha256',
    'configSha256',
    'artifactDigest',
    'canonicalTarget',
    'phase',
    'status',
    'guardCode',
    'guardPhase',
    'failureClass',
    'cause',
    'startedAt',
    'finishedAt',
    'executorHost',
    'approvalRefs',
    'providerOperationId',
    'deploymentId',
    'verificationRefs',
    'rollback',
    'nextAllowedPhase',
  ]);
  assert.equal(receipt.schemaVersion, 1);
  for (const key of ['jobId', 'attemptId', 'executorHost', 'guardPhase']) {
    assert.equal(typeof receipt[key], 'string');
    assert.match(receipt[key], /^[A-Za-z0-9:._/-]{1,256}$/);
  }
  assert.ok(Number.isInteger(receipt.epoch) && receipt.epoch > 0);
  assert.ok(
    [
      'queued',
      'admitted',
      'running',
      'awaiting_approval',
      'reconciling',
      'succeeded',
      'failed',
      'stopped',
      'unknown',
    ].includes(receipt.status)
  );
  assert.match(receipt.guardCode, /^[A-Z][A-Z0-9_]{0,63}$/);
  assert.ok(Number.isFinite(Date.parse(receipt.startedAt)));
  assert.ok(
    receipt.finishedAt === null ||
      Number.isFinite(Date.parse(receipt.finishedAt))
  );
  assert.ok(
    receipt.failureClass === null || typeof receipt.failureClass === 'string'
  );
  if (receipt.cause !== null) {
    closedRecord(receipt.cause, [
      'guardCode',
      'guardPhase',
      'failureClass',
      'terminal',
      'providerContacted',
    ]);
    assert.match(receipt.cause.guardCode, /^[A-Z][A-Z0-9_]{0,63}$/);
    for (const key of ['guardPhase', 'failureClass']) {
      assert.equal(typeof receipt.cause[key], 'string');
      assert.match(receipt.cause[key], /^[A-Za-z0-9_-]{1,64}$/);
    }
    assert.equal(typeof receipt.cause.terminal, 'boolean');
    assert.equal(typeof receipt.cause.providerContacted, 'boolean');
  }
  for (const key of ['providerOperationId', 'deploymentId'])
    if (receipt[key] !== null) {
      assert.equal(typeof receipt[key], 'string');
      assert.match(receipt[key], /^[A-Za-z0-9:._/-]{1,256}$/);
    }
  assert.ok(Array.isArray(receipt.verificationRefs));
  for (const ref of receipt.verificationRefs) {
    assert.equal(typeof ref, 'string');
    assert.match(ref, /^[A-Za-z0-9:._/-]{1,256}$/);
  }
  assert.deepEqual(receipt.approvalRefs, payload.authorizationRefs);
  assert.deepEqual(receipt.rollback, payload.rollback);
  assert.ok(
    receipt.nextAllowedPhase === null ||
      ['seal', 'publish', 'doctor', 'rollback'].includes(
        receipt.nextAllowedPhase
      )
  );
  for (const key of [
    'operationId',
    'sourceSha',
    'recipeSha256',
    'configSha256',
  ])
    assert.equal(receipt[key], payload[key]);
  assert.equal(receipt.artifactDigest, payload.artifact?.sha256 ?? null);
  assert.deepEqual(receipt.canonicalTarget, payload.target);
  assert.equal(receipt.phase, phase);
  assert.equal(receipt.jobId, grant.jobId);
}
export async function runCfPhase({
  authority,
  payload,
  grant,
  phase,
  execute,
  now = () => new Date().toISOString(),
}) {
  validateCfPayload(payload);
  safeData(grant);
  const phaseKey = cfPhaseKey(payload, phase);
  const receipt = {
    schemaVersion: 1,
    jobId: grant.jobId,
    operationId: payload.operationId,
    attemptId: grant.attemptId,
    epoch: grant.epoch,
    sourceSha: payload.sourceSha,
    recipeSha256: payload.recipeSha256,
    configSha256: payload.configSha256,
    artifactDigest: payload.artifact?.sha256 ?? null,
    canonicalTarget: payload.target,
    phase,
    status: 'running',
    guardCode: 'PHASE_RUNNING',
    guardPhase: phase,
    failureClass: null,
    cause: null,
    startedAt: new Date(now()).toISOString(),
    finishedAt: null,
    executorHost: grant.workerId,
    approvalRefs: payload.authorizationRefs,
    providerOperationId: null,
    deploymentId: null,
    verificationRefs: [],
    rollback: payload.rollback,
    nextAllowedPhase: null,
  };
  let intent = false,
    fenceValid = false,
    effectStarted = false,
    executorCompleted = false,
    fenceRejected = false;
  const controller = new AbortController();
  let timer;
  let rejectTimeout;
  const timeout = new Promise((_, reject) => {
    rejectTimeout = reject;
  });
  let deadline = performance.now() + payload.requirements.maxDurationMs;
  function arm(leaseMs) {
    deadline = Math.min(deadline, performance.now() + leaseMs);
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        const error = new RecipeFailure('DEADLINE_EXCEEDED', phase, 'timeout', {
          terminal: false,
          providerContacted: effectStarted,
        });
        controller.abort(error);
        Promise.resolve()
          .then(() => authority.requestStop(grant.jobId, grant.stopRevision))
          .catch(() => {});
        rejectTimeout(error);
      },
      Math.max(0, deadline - performance.now())
    );
  }
  async function checkFence() {
    if (controller.signal.aborted) throw controller.signal.reason;
    try {
      const current = await Promise.race([authority.renew(grant), timeout]);
      arm(confirmGrant(grant, current, phase));
    } catch (error) {
      fenceValid = false;
      fenceRejected = true;
      controller.abort(error);
      throw error;
    }
  }
  try {
    for (const method of ['beginPhase', 'renew', 'checkpoint'])
      if (typeof authority?.[method] !== 'function')
        throw new RecipeFailure('AUTHORITY_UNAVAILABLE', phase, 'authority');
    assert.equal(typeof execute, 'function');
    arm(confirmGrant(grant, grant, phase));
    const begun = await Promise.race([
      authority.beginPhase({ grant, payload, phase, phaseKey }),
      timeout,
    ]);
    if (begun.receipt) {
      matchesReceipt(begun.receipt, payload, phase, grant);
      return begun.receipt;
    }
    arm(confirmGrant(grant, begun.grant, phase));
    intent = true;
    fenceValid = true;
    await checkFence();
    effectStarted = true;
    const outcome = await Promise.race([
      execute({
        payload: structuredClone(payload),
        phase,
        phaseKey,
        signal: controller.signal,
        checkFence,
      }),
      timeout,
    ]);
    executorCompleted = true;
    safeData(outcome);
    assert.ok(outcome && typeof outcome === 'object');
    const keys = Object.keys(outcome);
    assert.ok(
      keys.every((key) =>
        ['providerOperationId', 'deploymentId', 'verificationRefs'].includes(
          key
        )
      )
    );
    for (const key of ['providerOperationId', 'deploymentId'])
      if (outcome[key] !== undefined) {
        assert.equal(typeof outcome[key], 'string');
        assert.match(outcome[key], /^[A-Za-z0-9:._/-]{1,256}$/);
        receipt[key] = outcome[key];
      }
    if (
      !Array.isArray(outcome.verificationRefs) ||
      outcome.verificationRefs.length === 0
    )
      throw new RecipeFailure('READBACK_MISSING', phase, 'verification', {
        providerContacted: true,
      });
    for (const ref of outcome.verificationRefs) {
      assert.equal(typeof ref, 'string');
      assert.match(ref, /^[A-Za-z0-9:._/-]{1,256}$/);
    }
    if (
      phase === 'rollback' &&
      outcome.deploymentId !== payload.rollback.deploymentId
    )
      throw new RecipeFailure(
        'ROLLBACK_READBACK_MISMATCH',
        phase,
        'verification',
        { providerContacted: true }
      );
    receipt.verificationRefs = outcome.verificationRefs;
    await checkFence();
    Object.assign(receipt, {
      status: 'succeeded',
      guardCode: 'PHASE_VERIFIED',
      finishedAt: new Date(now()).toISOString(),
    });
    matchesReceipt(receipt, payload, phase, grant);
    const committed = await Promise.race([
      authority.checkpoint({ grant, phaseKey, receipt }),
      timeout,
    ]);
    matchesReceipt(committed, payload, phase, grant);
    assert.deepEqual(committed, receipt);
    return committed;
  } catch (error) {
    const cause = failureCause(error, phase, effectStarted);
    safeData(cause);
    const uncertain =
      executorCompleted ||
      fenceRejected ||
      cause.providerContacted ||
      (!cause.terminal && effectStarted) ||
      (!intent && (cause.failureClass === 'fence' || !cause.terminal));
    Object.assign(receipt, {
      status: uncertain ? 'unknown' : 'failed',
      guardCode: uncertain ? 'RECONCILIATION_REQUIRED' : cause.guardCode,
      guardPhase: cause.guardPhase,
      failureClass: cause.failureClass,
      cause,
      finishedAt: new Date(now()).toISOString(),
    });
    // Rejected or expired grants cannot report results against another attempt's intent.
    if (intent && fenceValid && !controller.signal.aborted) {
      try {
        matchesReceipt(receipt, payload, phase, grant);
        await Promise.race([
          authority.checkpoint({ grant, phaseKey, receipt }),
          timeout,
        ]);
      } catch {
        /* The authority retains the unresolved intent. */
      }
    }
    return receipt;
  } finally {
    clearTimeout(timer);
  }
}
