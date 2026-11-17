import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closedRecord,
  validateReleaseRecipe,
} from './release-recipe-config.mjs';

const phases = ['seal', 'publish', 'doctor', 'rollback'];
const digestPattern = /^[a-f0-9]{64}$/;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}
export function payloadDigest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function requirePort(authority, methods) {
  assert.ok(authority, 'Deploy authority unavailable');
  for (const method of methods)
    assert.equal(
      typeof authority[method],
      'function',
      `Deploy authority unavailable: ${method}`
    );
}
export function cfQueueJob(record, account, input) {
  validateReleaseRecipe(record);
  assert.equal(record.platform, 'cf-wave1');
  closedRecord(input, [
    'operationId',
    'repository',
    'sourceSha',
    'recipeSha256',
    'configSha256',
    'requestedPhases',
    'artifact',
    'requirements',
    'authorizationRefs',
    'rollback',
    'provenance',
    'checkpointRef',
  ]);
  closedRecord(input.requirements, [
    'os',
    'arch',
    'toolchain',
    'capabilities',
    'cpu',
    'ramMiB',
    'diskMiB',
    'maxDurationMs',
    'maxInfrastructureRetries',
  ]);
  for (const key of ['os', 'arch', 'toolchain'])
    assert.ok(
      typeof input.requirements[key] === 'string' &&
        input.requirements[key].length > 0
    );
  assert.ok(
    Array.isArray(input.requirements.capabilities) &&
      input.requirements.capabilities.every(
        (value) => typeof value === 'string'
      )
  );
  for (const key of ['cpu', 'ramMiB', 'diskMiB'])
    assert.ok(
      Number.isInteger(input.requirements[key]) && input.requirements[key] > 0
    );
  closedRecord(input.provenance, ['actor', 'owningThread']);
  assert.match(account, /^[a-f0-9]{32}$/);
  assert.match(input.sourceSha, /^[a-f0-9]{40}$/);
  assert.match(input.recipeSha256, digestPattern);
  assert.match(input.configSha256, digestPattern);
  assert.equal(
    input.configSha256,
    payloadDigest(record),
    'Config digest differs'
  );
  assert.match(input.operationId, /^[A-Za-z0-9:_-]{1,128}$/);
  assert.match(input.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.ok(
    Array.isArray(input.requestedPhases) && input.requestedPhases.length > 0
  );
  assert.deepEqual(
    input.requestedPhases,
    phases.filter((phase) => input.requestedPhases.includes(phase)),
    'Unknown, duplicate or reordered phases'
  );
  assert.ok(
    input.authorizationRefs?.length > 0,
    'Authorization references required'
  );
  assert.ok(input.provenance?.actor && input.provenance?.owningThread);
  assert.ok(
    input.requirements &&
      Number.isInteger(input.requirements.maxDurationMs) &&
      input.requirements.maxDurationMs > 0 &&
      input.requirements.maxDurationMs <= 3600000
  );
  assert.ok(
    Number.isInteger(input.requirements.maxInfrastructureRetries) &&
      input.requirements.maxInfrastructureRetries >= 0 &&
      input.requirements.maxInfrastructureRetries <= 2
  );
  if (input.requestedPhases.some((phase) => phase !== 'seal')) {
    closedRecord(input.artifact, ['id', 'sha256']);
    assert.ok(input.artifact?.id, 'Immutable artifact required');
    assert.match(input.artifact.sha256, digestPattern);
  }
  if (input.requestedPhases.includes('rollback')) {
    closedRecord(input.rollback, ['deploymentId', 'authorizationRef', 'scope']);
    assert.equal(input.rollback.scope, 'recorded-preimage');
    assert.ok(
      input.rollback.deploymentId && input.rollback.authorizationRef,
      'Authorized recorded rollback target required'
    );
  }
  return structuredClone({
    schemaVersion: 1,
    operationId: input.operationId,
    jobType: 'cf-wave1',
    repository: input.repository,
    sourceSha: input.sourceSha,
    recipeSha256: input.recipeSha256,
    configSha256: input.configSha256,
    target: {
      provider: 'cloudflare',
      account,
      project: record.cf.productionWorker,
      app: record.app,
      environment: 'production',
    },
    requestedPhases: [...input.requestedPhases],
    artifact: input.artifact ?? null,
    requirements: input.requirements,
    authorizationRefs: input.authorizationRefs,
    rollback: input.rollback ?? null,
    provenance: input.provenance,
    checkpointRef: input.checkpointRef ?? null,
  });
}
export async function submitCfJob(authority, payload) {
  requirePort(authority, ['submit']);
  return authority.submit(structuredClone(payload));
}
export async function stopCfJob(authority, jobId, expectedRevision) {
  requirePort(authority, ['requestStop']);
  assert.ok(Number.isInteger(expectedRevision) && expectedRevision >= 0);
  return authority.requestStop(jobId, expectedRevision);
}
export function cfPhaseKey(payload, phase) {
  assert.ok(phases.includes(phase) && payload.requestedPhases.includes(phase));
  return payloadDigest({
    operationId: payload.operationId,
    canonicalTarget: payload.target,
    sourceSha: payload.sourceSha,
    artifactDigest: payload.artifact?.sha256 ?? null,
    phase,
  });
}
function sameGrant(previous, current) {
  for (const key of [
    'jobId',
    'attemptId',
    'workerId',
    'targetLockId',
    'leaseDeadline',
  ])
    assert.ok(
      typeof current?.[key] === 'string' && current[key].length > 0,
      `Missing authority grant: ${key}`
    );
  assert.ok(Number.isInteger(current.epoch) && current.epoch > 0);
  assert.ok(
    Number.isInteger(current.stopRevision) && current.stopRevision >= 0
  );
  for (const key of [
    'jobId',
    'attemptId',
    'workerId',
    'epoch',
    'targetLockId',
    'stopRevision',
  ])
    assert.equal(current?.[key], previous[key], `Rejected fence: ${key}`);
  assert.ok(current.leaseDeadline, 'Authority lease confirmation required');
}
function matchesReceipt(receipt, payload, phase, grant) {
  assert.equal(receipt.operationId, payload.operationId);
  assert.equal(receipt.sourceSha, payload.sourceSha);
  assert.equal(receipt.recipeSha256, payload.recipeSha256);
  assert.equal(receipt.configSha256, payload.configSha256);
  assert.equal(receipt.artifactDigest, payload.artifact?.sha256 ?? null);
  assert.deepEqual(receipt.canonicalTarget, payload.target);
  assert.equal(receipt.phase, phase);
  assert.equal(receipt.jobId, grant.jobId);
}
// beginPhase confirms current authority time, approval scope, immutable inputs,
// predecessor receipt, worker eligibility, target lock and durable stop revision.
// A grant alone is not permission to invoke an executor.
export async function runCfPhase({
  authority,
  payload,
  grant,
  phase,
  execute,
  now = () => new Date().toISOString(),
}) {
  const phaseKey = cfPhaseKey(payload, phase);
  const startedAt = now();
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
    startedAt,
    finishedAt: null,
    executorHost: grant.workerId,
    approvalRefs: payload.authorizationRefs,
    providerOperationId: null,
    deploymentId: null,
    verificationRefs: [],
    rollback: payload.rollback,
    nextAllowedPhase: null,
  };
  let effectStarted = false;
  try {
    requirePort(authority, ['beginPhase', 'renew', 'checkpoint']);
    assert.equal(typeof execute, 'function');
    const begun = await authority.beginPhase({
      grant,
      payload,
      phase,
      phaseKey,
    });
    sameGrant(grant, begun.grant);
    if (begun.receipt) {
      matchesReceipt(begun.receipt, payload, phase, grant);
      assert.ok(['succeeded', 'unknown'].includes(begun.receipt.status));
      return begun.receipt;
    }
    sameGrant(grant, await authority.renew(grant));
    effectStarted = true;
    const outcome = await execute({
      payload: structuredClone(payload),
      phase,
      phaseKey,
    });
    assert.ok(outcome && typeof outcome === 'object');
    if (outcome.providerOperationId !== undefined) {
      assert.equal(typeof outcome.providerOperationId, 'string');
      receipt.providerOperationId = outcome.providerOperationId;
    }
    if (outcome.deploymentId !== undefined) {
      assert.equal(typeof outcome.deploymentId, 'string');
      receipt.deploymentId = outcome.deploymentId;
    }
    if (phase === 'rollback')
      assert.equal(
        outcome.deploymentId,
        payload.rollback.deploymentId,
        'Rollback readback differs from recorded target'
      );
    assert.ok(
      Array.isArray(outcome.verificationRefs) &&
        outcome.verificationRefs.length > 0,
      'Readback evidence required'
    );
    receipt.verificationRefs = outcome.verificationRefs;
    sameGrant(grant, await authority.renew(grant));
    receipt.status = 'succeeded';
    receipt.guardCode = 'PHASE_VERIFIED';
    receipt.finishedAt = now();
    const committed = await authority.checkpoint({ grant, phaseKey, receipt });
    matchesReceipt(committed, payload, phase, grant);
    assert.deepEqual(committed, receipt);
    return committed;
  } catch {
    receipt.status = effectStarted ? 'unknown' : 'stopped';
    receipt.guardCode = effectStarted
      ? 'RECONCILIATION_REQUIRED'
      : 'AUTHORITY_FENCE_REJECTED';
    receipt.finishedAt = now();
    try {
      await authority.checkpoint({ grant, phaseKey, receipt });
    } catch {
      /* The durable intent remains unresolved at the authority. */
    }
    return receipt;
  }
}
