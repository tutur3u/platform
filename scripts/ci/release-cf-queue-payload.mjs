import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { credentialName } from './release-recipe-config.mjs';
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
const policy = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
);
export function recipeDigest() {
  const hash = createHash('sha256');
  for (const file of [
    'release-cf-queue.mjs',
    'release-cf-queue-payload.mjs',
    'release-cf-queue-errors.mjs',
    'release-recipe-config.mjs',
    'wave1-native-profile.mjs',
  ])
    hash.update(file).update(readFileSync(new URL(file, import.meta.url)));
  return hash.digest('hex');
}
const hexIds = new Set([
  'operationId',
  'jobId',
  'attemptId',
  'workerId',
  'targetLockId',
  'executorHost',
  'providerOperationId',
  'deploymentId',
  'id',
  'authorizationRefs',
  'approvalRefs',
  'verificationRefs',
  'checkpointRef',
]);
const digestFields = new Set([
  'recipeSha256',
  'configSha256',
  'sha256',
  'artifactDigest',
]);
function allowedHex(value, field, parent) {
  return (
    (field === 'account' && value === policy.accountId) ||
    (field === 'sourceSha' && /^[a-f0-9]{40}$/i.test(value)) ||
    (digestFields.has(field) && /^[a-f0-9]{64}$/i.test(value)) ||
    (hexIds.has(field) && /^[a-f0-9]{32}$/i.test(value)) ||
    (parent === 'artifact' && field === 'id' && /^[a-f0-9]{64}$/i.test(value))
  );
}
function credentialValue(value) {
  if (
    /^(?:sk[-_]|vercel_|vcp_|vcr_|vcs_|vc_|gh[pousr]_|github_pat_|cf(?:at|ut|t)?_|cloudflare[_-]|AKIA|ASIA|bearer |-----BEGIN)/.test(
      value
    )
  )
    return true;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    try {
      const [header, body] = value
        .split('.')
        .slice(0, 2)
        .map((part) =>
          JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
        );
      if (
        header &&
        typeof header === 'object' &&
        body &&
        typeof body === 'object'
      )
        return true;
    } catch {
      /* A dotted identifier is not a JWT without JSON header and payload. */
    }
  }
  if (value.length < 32 || !/^[A-Za-z0-9_\-./+=]+$/.test(value)) return false;
  const frequencies = new Map();
  for (const character of value)
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy >= 4;
}
export function safeData(value, depth = 0, field = '', parent = '') {
  assert.ok(depth < 16);
  if (typeof value === 'string') {
    assert.ok(value.length <= 256);
    assert.ok(
      allowedHex(value, field, parent) || !credentialValue(value),
      'Credential-shaped value'
    );
    assert.ok(
      !/(?:password|token|secret|credential|api[_-]?key)\s*[:=]/i.test(value),
      'Credential assignment'
    );
  } else if (Array.isArray(value)) {
    assert.ok(value.length <= 64);
    value.forEach((item) => safeData(item, depth + 1, field, parent));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assert.ok(
        ['authorizationRefs', 'authorizationRef'].includes(key) ||
          !credentialName.test(key),
        'Credential-shaped key'
      );
      safeData(item, depth + 1, key, field);
    }
  } else
    assert.ok(
      value === null || typeof value === 'number' || typeof value === 'boolean'
    );
}
const id = (value) => {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[A-Za-z0-9:._/-]{1,256}$/);
};
const ids = (values) => {
  assert.ok(Array.isArray(values) && values.length > 0);
  values.forEach(id);
};
export function cfQueueJob(record, input) {
  validateReleaseRecipe(record);
  assert.equal(record.platform, 'cf-wave1');
  assert.deepEqual(
    record,
    policy.apps[record.app]?.releaseRecipe,
    'Unreviewed record'
  );
  const account = policy.accountId;
  safeData(input);
  ids(input.authorizationRefs);
  id(input.provenance?.actor);
  id(input.provenance?.owningThread);
  if (input.checkpointRef !== null) id(input.checkpointRef);
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
        /^[A-Za-z0-9:._/-]{1,256}$/.test(input.requirements[key])
    );
  assert.ok(
    Array.isArray(input.requirements.capabilities) &&
      input.requirements.capabilities.every(
        (value) => typeof value === 'string'
      )
  );
  ids(input.requirements.capabilities);
  for (const key of ['cpu', 'ramMiB', 'diskMiB'])
    assert.ok(
      Number.isInteger(input.requirements[key]) && input.requirements[key] > 0
    );
  closedRecord(input.provenance, ['actor', 'owningThread']);
  assert.match(account, /^[a-f0-9]{32}$/);
  assert.match(input.sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(input.recipeSha256, recipeDigest(), 'Recipe digest differs');
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
    id(input.artifact.id);
    assert.match(input.artifact.sha256, digestPattern);
  } else assert.equal(input.artifact, null);
  if (input.requestedPhases.includes('rollback')) {
    assert.deepEqual(input.requestedPhases, ['rollback']);
    closedRecord(input.rollback, ['deploymentId', 'authorizationRef', 'scope']);
    assert.equal(input.rollback.scope, 'recorded-preimage');
    id(input.rollback.deploymentId);
    id(input.rollback.authorizationRef);
    assert.ok(
      input.rollback.deploymentId && input.rollback.authorizationRef,
      'Authorized recorded rollback target required'
    );
  } else assert.equal(input.rollback, null);
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
      aliases: [
        ...new Set([
          record.cf.productionWorker,
          policy.apps[record.app].productionWorker,
          ...record.canonicalHosts,
          ...record.mountHosts,
          ...Object.entries(
            policy.apps[record.app].ownerProvisionedResources ?? {}
          )
            .filter(([key]) => key.startsWith('retainedProduction'))
            .map(([, value]) => value),
        ]),
      ].sort(),
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
  validateCfPayload(payload);
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

export function validateCfPayload(payload) {
  safeData(payload);
  closedRecord(payload, [
    'schemaVersion',
    'operationId',
    'jobType',
    'repository',
    'sourceSha',
    'recipeSha256',
    'configSha256',
    'target',
    'requestedPhases',
    'artifact',
    'requirements',
    'authorizationRefs',
    'rollback',
    'provenance',
    'checkpointRef',
  ]);
  const { schemaVersion, jobType, target, ...input } = payload;
  assert.equal(schemaVersion, 1);
  assert.equal(jobType, 'cf-wave1');
  const record = policy.apps[target?.app]?.releaseRecipe;
  assert.ok(record);
  const expected = cfQueueJob(record, input);
  assert.deepEqual(payload, expected, 'Payload differs from reviewed recipe');
  return payload;
}
