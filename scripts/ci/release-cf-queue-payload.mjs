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
  'authorizationRefs',
  'approvalRefs',
  'verificationRefs',
  'checkpointRef',
  'authorizationRef',
]);
const digestFields = new Set([
  'recipeSha256',
  'configSha256',
  'sha256',
  'artifactDigest',
]);
const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function allowedHex(value, field, parent) {
  return (
    (field === 'account' && value === policy.accountId) ||
    (field === 'sourceSha' && /^[a-f0-9]{40}$/i.test(value)) ||
    (digestFields.has(field) && /^[a-f0-9]{64}$/i.test(value)) ||
    (hexIds.has(field) &&
      (/^[a-f0-9]{32}$/i.test(value) || uuidPattern.test(value))) ||
    (parent === 'artifact' &&
      field === 'id' &&
      (/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/i.test(value) ||
        uuidPattern.test(value)))
  );
}
const reviewedApps = new Set(Object.keys(policy.apps));
const reviewedOrigins = new Set(
  Object.values(policy.apps).flatMap((settings) => [
    ...settings.releaseRecipe.canonicalHosts,
    ...settings.releaseRecipe.mountHosts,
  ])
);
const reviewedWorkers = new Set(
  Object.values(policy.apps).flatMap((settings) => [
    settings.productionWorker,
    settings.releaseRecipe.cf.productionWorker,
  ])
);
function containsJwt(value) {
  if (!value.includes('.')) return false;
  for (const pattern of [
    /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  ]) {
    for (const [candidate] of value.matchAll(pattern)) {
      try {
        const [header, body] = candidate
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
        /* Ordinary dotted labels do not decode as JWT JSON. */
      }
    }
  }
  return false;
}
function readableCamelCase(value) {
  return /^(?:[a-z]{2,24}|[A-Z][a-z]{1,23})(?:[A-Z][a-z]{1,23})+$/.test(value);
}
function readableSegment(value) {
  return (
    /^[a-z]{1,24}(?:[0-9]{1,4}[a-z]{1,24})*[0-9]{0,4}$/.test(value) ||
    /^[0-9]{1,12}$/.test(value) ||
    /^[A-Z]{1,24}$/.test(value) ||
    /^[A-Z][a-z]{1,23}$/.test(value) ||
    readableCamelCase(value)
  );
}
const artifactOrigins = new Set(
  Object.values(policy.apps).flatMap(
    (settings) => settings.releaseRecipe.canonicalHosts
  )
);
function artifactUrl(value, origins = artifactOrigins) {
  try {
    const url = new URL(value);
    return (
      value === url.href &&
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      origins.has(url.origin) &&
      !credentialValue(url.hostname) &&
      /^\/sealed\/[a-f0-9]{64}$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
function credentialValue(value) {
  if (containsJwt(value)) return true;
  if (
    /^(?:sk[-_]|vercel_|vcp_|vcr_|vcs_|vc_|gh[pousr]_|github_pat_|sbp_|npm_|cf(?:at|ut|t)?_|cloudflare_|AKIA|ASIA|-----BEGIN)/.test(
      value
    ) ||
    /^bearer\s/i.test(value)
  )
    return true;
  const withoutUuids = value.replace(
    /(?<![A-Za-z0-9])[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![A-Za-z0-9])/gi,
    ' uuid '
  );
  const tokens = withoutUuids.split(/[:/\-_.=+@\s]+/);
  for (const token of tokens) {
    if (/^[a-f0-9]{32,}$/i.test(token)) return true;
    if (readableCamelCase(token)) continue;
    if (/^[A-Za-z0-9]{32,}$/.test(token)) return true;
    if (
      token.length >= 30 &&
      ((/[A-Z]/.test(token) && /[a-z0-9]/.test(token)) ||
        (/[a-z]/.test(token) && /[0-9]/.test(token)))
    ) {
      const counts = new Map();
      for (const char of token) counts.set(char, (counts.get(char) ?? 0) + 1);
      const entropy = [...counts.values()].reduce((sum, count) => {
        const probability = count / token.length;
        return sum - probability * Math.log2(probability);
      }, 0);
      if (entropy >= 3.5) return true;
    }
  }
  if (/[a-f0-9]{32,}/i.test(withoutUuids)) return true;
  if (/v1\.0-[a-f0-9]+-[a-f0-9]+/i.test(withoutUuids)) return true;
  for (const [run] of withoutUuids.matchAll(
    /(?:[a-f0-9]{8,}[-_/])+[a-f0-9]{8,}/gi
  )) {
    if (run.replace(/[-_/]/g, '').length >= 32) return true;
  }
  for (const [run] of withoutUuids.matchAll(/[A-Za-z0-9+/_-]{31,}={0,2}/g)) {
    if (
      !run
        .split(/[-_/+]+/)
        .filter(Boolean)
        .every(readableSegment)
    )
      return true;
  }
  return false;
}
function structuredReference(value, field) {
  const uuidOrId = (segment) =>
    uuidPattern.test(segment) || /^[a-f0-9]{32}$/i.test(segment);
  const digest = (segment) => /^[a-f0-9]{64}$/i.test(segment);
  if (!['verificationRefs', 'checkpointRef'].includes(field)) return false;
  const path = value.startsWith('cloudflare:')
    ? value.slice('cloudflare:'.length)
    : value;
  const segments = path.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  )
    return false;
  if (
    segments.length === 3 &&
    segments[0] === 'readback' &&
    reviewedApps.has(segments[1])
  )
    return uuidOrId(segments[2]) || digest(segments[2]);
  if (segments.length !== 4) return false;
  if (segments[0] === 'workers')
    return (
      reviewedWorkers.has(segments[1]) &&
      ['deployments', 'versions'].includes(segments[2]) &&
      uuidOrId(segments[3])
    );
  return (
    segments[0] === 'cf-wave1' &&
    (reviewedApps.has(segments[1]) || reviewedWorkers.has(segments[1])) &&
    ['version-readback', 'deployment-readback'].includes(segments[2]) &&
    uuidOrId(segments[3])
  );
}
export function metadataStringIsSafe(value, field = '', parent = '') {
  if (typeof value !== 'string' || value.length > 256) return false;
  if (
    parent === 'artifact' &&
    field === 'id' &&
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  )
    return artifactUrl(value);
  if (/(?:password|token|secret|credential|api[_-]?key)\s*[:=]/i.test(value))
    return false;
  const reviewedTarget =
    (field === 'project' && reviewedWorkers.has(value)) ||
    (field === 'aliases' &&
      (reviewedWorkers.has(value) || reviewedOrigins.has(value)));
  return (
    reviewedTarget ||
    allowedHex(value, field, parent) ||
    structuredReference(value, field) ||
    !credentialValue(value)
  );
}
export function safeData(value, depth = 0, field = '', parent = '') {
  assert.ok(depth < 16);
  if (typeof value === 'string') {
    assert.ok(
      metadataStringIsSafe(value, field, parent),
      'Credential-shaped value'
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
    if (/^[a-z][a-z0-9+.-]*:/i.test(input.artifact.id))
      assert.ok(
        artifactUrl(input.artifact.id, new Set(record.canonicalHosts)),
        'Artifact URL differs from reviewed app origin'
      );
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
