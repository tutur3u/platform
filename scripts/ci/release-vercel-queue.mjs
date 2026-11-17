// Proposed offline D395 port: b6f205d528b091b1dbe5fc27e48cadb8b7c402a4a16a82c4a02730ddaab4901e.
import { createHash } from 'node:crypto';
import { ReleaseStop } from './release-vercel-errors.mjs';

export const QUEUE_CODES = Object.freeze([
  'QUEUE_AUTHORITY_UNAVAILABLE',
  'QUEUE_PAYLOAD_INVALID',
  'QUEUE_GRANT_INVALID',
  'QUEUE_PHASE_UNKNOWN',
  'QUEUE_EFFECT_UNKNOWN',
  'QUEUE_EXECUTION_FAILED',
  'QUEUE_STOPPED',
  'QUEUE_CONFLICT',
]);
export class QueueStop extends Error {
  constructor(code, phase = 'submit') {
    super(code);
    if (!QUEUE_CODES.includes(code)) throw new TypeError('Unknown queue guard');
    this.guardCode = code;
    this.guardPhase = phase;
  }
}
const refuse = (code, phase) => {
  throw new QueueStop(code, phase);
};
const modes = new Set(['stage', 'promote', 'watch', 'rollback']);
const digest = /^[a-f0-9]{64}$/u;
const id = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9_./:@-]{1,200}$/u.test(v);
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]])
        )
      : v
  );
export const payloadDigest = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex');
function portMethod(port, name, phase) {
  if (typeof port?.[name] !== 'function')
    refuse('QUEUE_AUTHORITY_UNAVAILABLE', phase);
}
async function authorityCall(port, name, args, phase) {
  portMethod(port, name, phase);
  try {
    return await port[name](...args);
  } catch (error) {
    if (error instanceof QueueStop) throw error;
    if (error?.code === 'CONFLICT') refuse('QUEUE_CONFLICT', phase);
    refuse('QUEUE_AUTHORITY_UNAVAILABLE', phase);
  }
}
function closed(value, required, optional = []) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => [...required, ...optional].includes(key))
  );
}
export const aliasLockKey = (target) =>
  payloadDigest({
    provider: target.provider,
    account: target.account,
    project: target.project,
    alias: target.alias,
  });
function secretField(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) =>
      /PASSWORD|TOKEN|SECRET|KEY|CREDENTIAL/iu.test(key) ||
      secretField(child, seen)
  );
}
export function validateQueuePayload(payload, reviewedTarget) {
  const bad = () => refuse('QUEUE_PAYLOAD_INVALID');
  if (
    secretField(payload) ||
    (payload?.checkpointRef !== undefined && !id(payload.checkpointRef))
  )
    bad();
  if (
    !closed(
      payload,
      [
        'schemaVersion',
        'operationId',
        'jobType',
        'repository',
        'sourceSha',
        'recipeSha256',
        'configSha256',
        'target',
        'requestedPhases',
        'requirements',
        'authorizationRefs',
        'rollback',
        'provenance',
      ],
      ['artifact', 'checkpointRef']
    )
  )
    bad();
  if (
    !closed(payload.requirements, [
      'os',
      'arch',
      'toolchain',
      'capabilities',
      'cpu',
      'ramMiB',
      'diskMiB',
      'maxDurationMs',
      'infrastructureRetryLimit',
    ]) ||
    !closed(payload.rollback, ['deploymentId', 'authorizationRef']) ||
    !closed(payload.provenance, ['actor', 'thread']) ||
    (payload.artifact !== undefined &&
      !closed(payload.artifact, ['id', 'sha256']))
  )
    bad();
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    payload.jobType !== 'vercel-release' ||
    !id(payload.operationId) ||
    !id(payload.repository) ||
    !/^[a-f0-9]{40}$/u.test(payload.sourceSha) ||
    !digest.test(payload.recipeSha256) ||
    !digest.test(payload.configSha256) ||
    !Array.isArray(payload.requestedPhases) ||
    payload.requestedPhases.length !== 1 ||
    !modes.has(payload.requestedPhases[0])
  )
    bad();
  const targetFields = [
    'provider',
    'account',
    'project',
    'app',
    'environment',
    'alias',
  ];
  if (
    !reviewedTarget ||
    !payload.target ||
    Object.keys(payload.target).length !== targetFields.length ||
    targetFields.some((k) => !id(payload.target[k])) ||
    payload.target.provider !== 'vercel' ||
    canonical(payload.target) !== canonical(reviewedTarget)
  )
    bad();
  const req = payload.requirements;
  if (
    !req ||
    !id(req.os) ||
    !id(req.arch) ||
    !id(req.toolchain) ||
    !Array.isArray(req.capabilities) ||
    !req.capabilities.every(id) ||
    ['cpu', 'ramMiB', 'diskMiB', 'maxDurationMs'].some(
      (k) => !Number.isSafeInteger(req[k]) || req[k] <= 0
    ) ||
    !Number.isSafeInteger(req.infrastructureRetryLimit) ||
    req.infrastructureRetryLimit < 0 ||
    req.infrastructureRetryLimit > 3
  )
    bad();
  if (
    !Array.isArray(payload.authorizationRefs) ||
    !payload.authorizationRefs.length ||
    !payload.authorizationRefs.every(id) ||
    !id(payload.provenance?.actor) ||
    !id(payload.provenance?.thread) ||
    !id(payload.rollback?.deploymentId) ||
    !id(payload.rollback?.authorizationRef)
  )
    bad();
  if (
    payload.requestedPhases[0] !== 'stage' &&
    (!id(payload.artifact?.id) || !digest.test(payload.artifact?.sha256))
  )
    bad();
  return structuredClone(payload);
}
export async function submitVercelRelease(port, payload, reviewedTarget) {
  portMethod(port, 'submit');
  return authorityCall(
    port,
    'submit',
    [validateQueuePayload(payload, reviewedTarget)],
    'submit'
  );
}
export async function requestVercelStop(port, jobId, expectedRevision) {
  portMethod(port, 'requestStop', 'stop');
  if (
    !id(jobId) ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  )
    refuse('QUEUE_PAYLOAD_INVALID', 'stop');
  return authorityCall(port, 'requestStop', [jobId, expectedRevision], 'stop');
}

// No provider transport exists here. Effects are injected; the authority must
// durably authorize each intent and confirm the epoch/stop fence after it.
export async function executeVercelPhase({
  port,
  payload,
  reviewedTarget,
  execute,
  host,
}) {
  const job = validateQueuePayload(payload, reviewedTarget);
  const phase = job.requestedPhases[0];
  for (const name of ['claim', 'renew', 'beginPhase', 'checkpoint', 'finish'])
    portMethod(port, name, phase);
  if (typeof execute !== 'function' || !id(host))
    refuse('QUEUE_PAYLOAD_INVALID', phase);
  const grant = await authorityCall(port, 'claim', [job], phase);
  const valid = (g) =>
    g &&
    id(g.jobId) &&
    id(g.attemptId) &&
    id(g.workerId) &&
    Number.isSafeInteger(g.epoch) &&
    g.epoch > 0 &&
    id(g.targetLockId) &&
    g.aliasLockKey === aliasLockKey(job.target) &&
    Number.isSafeInteger(g.stopRevision) &&
    g.stopRevision >= 0 &&
    Number.isFinite(g.leaseDeadline);
  if (!valid(grant)) refuse('QUEUE_GRANT_INVALID', phase);
  const key = {
    operationId: job.operationId,
    canonicalTarget: job.target,
    sourceSha: job.sourceSha,
    artifactDigest: job.artifact?.sha256 ?? job.configSha256,
    phase,
  };
  const intent = await authorityCall(port, 'beginPhase', [grant, key], phase);
  if (intent?.status === 'succeeded') {
    const replay = intent.receipt;
    if (
      !replay ||
      replay.status !== 'succeeded' ||
      replay.operationId !== job.operationId ||
      replay.phase !== phase ||
      replay.sourceSha !== job.sourceSha ||
      replay.configSha256 !== job.configSha256 ||
      replay.recipeSha256 !== job.recipeSha256 ||
      replay.artifactSha256 !== (job.artifact?.sha256 ?? null) ||
      canonical(replay.canonicalTarget) !== canonical(job.target)
    )
      refuse('QUEUE_GRANT_INVALID', phase);
    return replay;
  }
  if (intent?.status === 'unknown' || intent?.status === 'reconciling')
    refuse('QUEUE_PHASE_UNKNOWN', phase);
  if (intent?.status !== 'running') refuse('QUEUE_GRANT_INVALID', phase);
  let startedEffect = false;
  let unknown = false;
  let sequence = 0;
  async function fence() {
    const current = await authorityCall(port, 'renew', [grant], phase);
    if (
      !valid(current) ||
      [
        'jobId',
        'attemptId',
        'workerId',
        'epoch',
        'targetLockId',
        'stopRevision',
      ].some((k) => current[k] !== grant[k])
    )
      refuse('QUEUE_STOPPED', phase);
    // Authority time, rather than the worker's wall clock, governs expiry.
    if (
      !Number.isFinite(current.authorityNow) ||
      current.authorityNow >= current.leaseDeadline
    )
      refuse('QUEUE_GRANT_INVALID', phase);
  }
  const startedAt = new Date().toISOString();
  const receipt = (status, code, evidence = null) => ({
    startedAt,
    finishedAt: new Date().toISOString(),
    providerOperationId: evidence?.deploymentId ?? null,
    schemaVersion: 1,
    jobId: grant.jobId,
    operationId: job.operationId,
    attemptId: grant.attemptId,
    epoch: grant.epoch,
    sourceSha: job.sourceSha,
    recipeSha256: job.recipeSha256,
    configSha256: job.configSha256,
    artifactSha256: job.artifact?.sha256 ?? null,
    canonicalTarget: job.target,
    phase,
    status,
    guardCode: code,
    guardPhase: phase,
    executorHost: host,
    authorizationRefs: job.authorizationRefs,
    approvalVerificationId: intent.approvalVerificationId ?? null,
    rollback: job.rollback,
    evidence,
    nextAllowedPhase: null,
  });
  try {
    await fence();
    const evidence = await execute({
      payload: structuredClone(job),
      predecessor: intent.predecessor,
      predecessorSha256: intent.predecessorSha256,
      approval: intent.approval,
      approvalVerificationId: intent.approvalVerificationId,
      async checkFence() {
        await fence();
      },
      async effect(label, action) {
        if (unknown) refuse('QUEUE_EFFECT_UNKNOWN', phase);
        await fence();
        const allowed = await port.checkpoint(grant, {
          ...key,
          sequence: sequence++,
          label,
          status: 'intent',
        });
        if (allowed?.status !== 'running') refuse('QUEUE_GRANT_INVALID', phase);
        startedEffect = true;
        try {
          const result = await action();
          await fence();
          return result;
        } catch {
          unknown = true;
          refuse('QUEUE_EFFECT_UNKNOWN', phase);
        }
      },
    });
    await fence();
    if (unknown) refuse('QUEUE_EFFECT_UNKNOWN', phase);
    const result = receipt('succeeded', null, evidence);
    const checkpoint = await authorityCall(
      port,
      'checkpoint',
      [grant, result],
      phase
    );
    if (!['running', 'succeeded'].includes(checkpoint?.status))
      refuse('QUEUE_GRANT_INVALID', phase);
    const finished = await authorityCall(
      port,
      'finish',
      [grant, [result]],
      phase
    );
    if (finished?.status !== 'succeeded') refuse('QUEUE_GRANT_INVALID', phase);
    return result;
  } catch (error) {
    const code =
      error instanceof QueueStop || error instanceof ReleaseStop
        ? error.guardCode
        : 'QUEUE_EXECUTION_FAILED';
    const result = receipt(
      startedEffect
        ? 'unknown'
        : code === 'QUEUE_STOPPED'
          ? 'stopped'
          : 'failed',
      code
    );
    result.guardPhase =
      error instanceof QueueStop || error instanceof ReleaseStop
        ? error.guardPhase
        : phase;
    // A lost authority cannot acknowledge this receipt; the caller must retain
    // it for reconciliation. No retries or second mutation are attempted.
    try {
      await port.checkpoint(grant, result);
    } catch {
      /* caller retains receipt */
    }
    return result;
  }
}
