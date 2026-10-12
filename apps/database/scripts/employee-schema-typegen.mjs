import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createEmployeeNetwork,
  removeEmployeeNetwork,
  runTypegenCommand,
  verifyEmployeeNetwork,
} from './employee-schema-network.mjs';

export {
  createEmployeeNetwork,
  createNetworkEventProof,
  readEmployeeNetwork,
  removeEmployeeNetwork,
  runTypegenCommand,
  startEmployeeNetworkObserver,
  validateEmployeeNetwork,
  verifyEmployeeNetwork,
} from './employee-schema-network.mjs';

const schemaNames = Object.freeze(['public', 'private', 'storage']);
const reviewedCliVersion = '2.117.0';
const failure = () => new Error('Bounded employee type generation failed');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Emit only fixed signatures, never the captured startup diagnostics or their values. */
export function classifyEmployeeStartupFailure(result) {
  const limit = 65536;
  if (typeof result?.stderr !== 'string')
    return {
      diagnosticKind: 'startup-stderr-signature-v1',
      category: 'unavailable',
      capturedBytes: 0,
    };
  const bytes = Buffer.byteLength(result.stderr, 'utf8');
  let category = 'unknown';
  if (bytes > limit || result.error?.code === 'ENOBUFS') category = 'truncated';
  else {
    const patterns = [
      [
        'image-operation-signature',
        /^(?:error: )?failed to (?:pull|inspect) docker image[: ]/imu,
      ],
      [
        'container-create-signature',
        /^(?:error: )?failed to create docker container[: ]/imu,
      ],
      [
        'container-start-signature',
        /^(?:error: )?failed to start docker container[: ]/imu,
      ],
      [
        'database-connect-signature',
        /^(?:error: )?failed to connect to postgres[: ]/imu,
      ],
      [
        'database-health-signature',
        /^(?:error: )?[a-z0-9_-]{1,128} container is not ready: (?:unhealthy|exited)\b/imu,
      ],
      [
        'container-job-signature',
        /^(?:error: )?error running container: exit [0-9]+\b/imu,
      ],
    ];
    const found = patterns.filter(([, pattern]) => pattern.test(result.stderr));
    if (found.length === 1) category = found[0][0];
    else if (found.length > 1) category = 'ambiguous';
  }
  return {
    diagnosticKind: 'startup-stderr-signature-v1',
    category,
    capturedBytes: Math.min(bytes, limit + 1),
  };
}

/** Only fixed connection signatures/target-equality booleans; never emit a captured address. */
export function employeeStartupConnectionEvidence(result, ownedPort) {
  const output = {
    stderrComplete: false,
    subtypeKnown: false,
    subtypeAmbiguous: false,
    refusedSignature: false,
    timeoutSignature: false,
    authRejectedSignature: false,
    dnsFailureSignature: false,
    ownedIpv4LoopbackTargetSignature: false,
  };
  if (
    typeof result?.stderr !== 'string' ||
    Buffer.byteLength(result.stderr) > 65536 ||
    result.error?.code === 'ENOBUFS'
  )
    return output;
  output.stderrComplete = true;
  const matches = [
    ['refusedSignature', /connect: connection refused\b/iu],
    [
      'timeoutSignature',
      /(?:i\/o timeout|connect(?:ion)? timeout|context deadline exceeded)\b/iu,
    ],
    [
      'authRejectedSignature',
      /(?:password authentication failed|SQLSTATE 28P01)\b/iu,
    ],
    [
      'dnsFailureSignature',
      /(?:no such host|temporary failure in name resolution)\b/iu,
    ],
  ].filter(([, expression]) => expression.test(result.stderr));
  output.subtypeKnown = matches.length === 1;
  output.subtypeAmbiguous = matches.length > 1;
  if (output.subtypeKnown) output[matches[0][0]] = true;
  if (Number.isInteger(ownedPort) && ownedPort >= 1024 && ownedPort <= 65535)
    output.ownedIpv4LoopbackTargetSignature = new RegExp(
      `dial tcp 127\\.0\\.0\\.1:${ownedPort}(?:\\s|:)`,
      'iu'
    ).test(result.stderr);
  return output;
}

const evidenceFailure = () =>
  new Error('Employee startup evidence unavailable');
export const employeeStartEvidenceFields = Object.freeze([
  'observerReady',
  'observerEndSeen',
  'observerDrained',
  'observerUncertain',
  'daemonVersionInspectionSucceeded',
  'daemonMatchesReviewedMoby28_0_4',
  'containerInspectionSucceeded',
  'ownedContainerIdentityVerified',
  'soleInternalNetworkVerified',
  'requested5432MappingPresent',
  'requested5432MappingMatchesChosenPort',
  'effective5432MappingPresent',
  'effective5432MappingMatchesChosenPort',
  'healthInspectionSucceeded',
  'healthyObserved',
  'unhealthyObserved',
  'loopbackProbeAttempted',
  'loopbackTcpConnected',
  'loopbackTcpRefused',
  'loopbackTcpTimedOut',
  'loopbackProbeSkippedOwnershipUnproven',
  'inspectionLostBeforeTeardown',
]);
export const emptyEmployeeStartEvidence = () =>
  Object.fromEntries(employeeStartEvidenceFields.map((key) => [key, false]));
export function parseEmployeeStartEvidence(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== employeeStartEvidenceFields.length ||
    !employeeStartEvidenceFields.every((key) => typeof value[key] === 'boolean')
  )
    throw evidenceFailure();
  return Object.fromEntries(
    employeeStartEvidenceFields.map((key) => [key, value[key]])
  );
}
const evidenceRecord = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
export function validateEmployeeStartInput(input) {
  if (
    !evidenceRecord(input) ||
    Object.keys(input).sort().join(',') !==
      'controlSha,dbPort,imageRef,network,projectId,sourceSha' ||
    !/^[a-f0-9]{40}$/.test(input.sourceSha ?? '') ||
    !/^[a-f0-9]{40}$/.test(input.controlSha ?? '') ||
    !/^tt-[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9]{10}$/.test(input.projectId ?? '') ||
    input.projectId.length > 128 ||
    Buffer.byteLength(JSON.stringify(input)) > 4096 ||
    !Number.isInteger(input.dbPort) ||
    input.dbPort < 1024 ||
    input.dbPort > 65535 ||
    input.imageRef !== 'ghcr.io/supabase/postgres:17.6.1.167' ||
    !evidenceRecord(input.network) ||
    Object.keys(input.network).sort().join(',') !== 'id,labels,name' ||
    !/^[a-f0-9]{64}$/.test(input.network.id ?? '') ||
    !/^tt-employee-net-[1-9][0-9]*-[1-9][0-9]*$/.test(input.network.name ?? '')
  )
    throw evidenceFailure();
  const labels = input.network.labels;
  if (
    !evidenceRecord(labels) ||
    Object.keys(labels).sort().join(',') !==
      'ttr.employee.attempt,ttr.employee.control,ttr.employee.nonce,ttr.employee.project,ttr.employee.run,ttr.employee.source' ||
    labels['ttr.employee.source'] !== input.sourceSha ||
    labels['ttr.employee.control'] !== input.controlSha ||
    labels['ttr.employee.project'] !== input.projectId ||
    !/^[a-f0-9-]{36}$/.test(labels['ttr.employee.nonce'] ?? '') ||
    !/^[1-9][0-9]*$/.test(labels['ttr.employee.run'] ?? '') ||
    !/^[1-9][0-9]*$/.test(labels['ttr.employee.attempt'] ?? '') ||
    labels['com.supabase.cli.project'] !== undefined
  )
    throw evidenceFailure();
  if (
    input.network.name !==
    `tt-employee-net-${labels['ttr.employee.run']}-${labels['ttr.employee.attempt']}`
  )
    throw evidenceFailure();
  return input;
}
export function matchesEmployeeEvidenceNetwork(actual, expected) {
  return (
    actual?.id === expected.id &&
    actual?.name === expected.name &&
    actual?.internal === true &&
    actual?.driver === 'bridge' &&
    actual?.cliProject == null &&
    ['source', 'control', 'run', 'attempt', 'nonce', 'project'].every(
      (key) => actual?.labels?.[key] === expected.labels[`ttr.employee.${key}`]
    )
  );
}
export function isEmployeeReadyMarker(marker, input) {
  return (
    evidenceRecord(marker) &&
    /^[a-f0-9]{64}$/.test(marker.id ?? '') &&
    new RegExp(`^${input.network.name}-ready-[a-f0-9]{8}$`).test(
      marker.name ?? ''
    ) &&
    /^[a-f0-9-]{36}$/.test(marker.labels?.['ttr.employee.nonce'] ?? '') &&
    ['source', 'control', 'run', 'attempt', 'project'].every(
      (key) =>
        marker.labels?.[`ttr.employee.${key}`] ===
        input.network.labels[`ttr.employee.${key}`]
    )
  );
}

/** Hash complete selected schema-source paths and bytes without emitting SQL or fixture contents. */
export function schemaSnapshotHash(repositoryRoot, trackedFiles) {
  const entries = [...trackedFiles].sort().map((file) => {
    if (!file.startsWith('apps/database/supabase/') || file.includes('..')) {
      throw failure();
    }
    return [file, sha256(readFileSync(path.join(repositoryRoot, file)))];
  });
  return sha256(JSON.stringify(entries));
}

/** Generate only local schema definitions; never write generated bytes into selected source. */
export async function generateEmployeeTypes({
  binaryPath,
  metadata,
  receiptDirectory,
  sourceSha,
  controlSha,
  snapshotSha256,
  network,
  runner = runTypegenCommand,
}) {
  if (
    !/^[a-f0-9]{40}$/u.test(sourceSha ?? '') ||
    !/^[a-f0-9]{40}$/u.test(controlSha ?? '') ||
    !/^[a-f0-9]{64}$/u.test(snapshotSha256 ?? '') ||
    metadata.headSha !== sourceSha ||
    !/^tt-[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9]{10}$/u.test(metadata.projectId ?? '')
  )
    throw failure();
  await verifyEmployeeNetwork(network, runner);
  const stat = lstatSync(receiptDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure();
  const version = (
    await runner(binaryPath, ['--version'], metadata.disposableRoot, {
      timeoutMs: 10000,
      maxBytes: 1024,
    })
  )
    .toString('utf8')
    .trim();
  if (version !== reviewedCliVersion) throw failure();
  await verifyEmployeeNetwork(network, runner);
  const contents = await runner(
    binaryPath,
    [
      '--network-id',
      network.name,
      '--workdir',
      metadata.disposableRoot,
      'gen',
      'types',
      'typescript',
      '--local',
      '--schema',
      schemaNames.join(','),
      '--query-timeout',
      '30s',
    ],
    metadata.disposableRoot
  );
  const text = contents.toString('utf8');
  if (
    !contents.equals(Buffer.from(text)) ||
    !text.trim() ||
    !/^export type Database\s*=\s*\{/mu.test(text) ||
    !schemaNames.every((schema) =>
      new RegExp(`^  ${schema}: \\{`, 'mu').test(text)
    )
  )
    throw failure();
  const artifact = 'generated-types.ts';
  writeFileSync(path.join(receiptDirectory, artifact), contents, {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    version: 1,
    sourceSha,
    controlSha,
    projectId: metadata.projectId,
    snapshotSha256,
    snapshotKind: 'tracked-source-before-isolated-config-rewrite',
    schemas: schemaNames,
    cliVersion: version,
    networkId: network.id,
    artifact,
    sha256: sha256(contents),
    bytes: contents.length,
    generated: true,
    consumerQualified: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const sourceRoot = path.resolve('source');
    if (process.argv[2] === '--create-network')
      await createEmployeeNetwork(sourceRoot);
    else if (process.argv[2] === '--remove-network')
      await removeEmployeeNetwork(sourceRoot);
    else throw new Error('Employee internal network admission failed');
  } catch {
    console.error('Employee internal network admission failed');
    process.exitCode = 1;
  }
}
