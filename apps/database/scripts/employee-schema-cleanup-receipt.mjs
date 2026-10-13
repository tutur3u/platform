import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const failure = () => new Error('Employee internal network admission failed');
const labelPrefix = 'ttr.employee.';
const networkFields = [
  'source',
  'control',
  'run',
  'attempt',
  'nonce',
  'project',
];
const networkFailure = failure;
export function validateEmployeeNetwork(actual, expected) {
  if (
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected.id ?? '') ||
    actual.Id !== expected.id ||
    actual.Name !== expected.name ||
    actual.Internal !== true ||
    actual.Driver !== 'bridge' ||
    actual.Labels?.['com.supabase.cli.project'] !== undefined ||
    !networkFields.every(
      (key) =>
        typeof expected.labels?.[labelPrefix + key] === 'string' &&
        actual.Labels?.[labelPrefix + key] ===
          expected.labels[labelPrefix + key]
    )
  )
    throw networkFailure();
  return expected;
}
/** Read a fresh exact-run receipt before destructive cleanup, never after network removal. */
export function readEmployeeCleanupReceipt(context, expected) {
  const filename = path.join(context.receiptDirectory, 'qualification.json');
  try {
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
      throw failure();
    const bytes = readFileSync(filename);
    if (bytes.length > 65536) throw failure();
    const receipt = JSON.parse(bytes.toString('utf8')),
      now = Date.now();
    if (
      receipt?.version !== 1 ||
      receipt.sourceSha !== context.source ||
      receipt.controlSha !== context.control ||
      receipt.networkId !== expected.id ||
      receipt.networkNonce !== expected.labels['ttr.employee.nonce'] ||
      receipt.runId !== context.run ||
      receipt.runAttempt !== context.attempt ||
      !Number.isInteger(receipt.workerDrainRecordedAt) ||
      receipt.workerDrainRecordedAt > now ||
      now - receipt.workerDrainRecordedAt > 60000 ||
      receipt.networkObserverDrained !== true ||
      receipt.networkProof?.observerDrained !== true ||
      receipt.relayEvidence?.drained !== true ||
      receipt.startupEvidenceDrained !== true
    )
      throw failure();
    return receipt;
  } catch {
    throw failure();
  }
}
/** Preserve the previous exact physical-cleanup receipt fields and serialization. */
export function writeEmployeeNetworkCleanupReceipt(
  directory,
  context,
  expected
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(directory, 'network-cleanup.json'),
    JSON.stringify({
      version: 1,
      sourceSha: context.source,
      controlSha: context.control,
      networkId: expected.id,
      removed: true,
      projectContainersAbsent: true,
    }),
    { flag: 'wx', mode: 0o600 }
  );
}
export function writeEmployeeCleanupQualification(directory, receipt) {
  writeFileSync(
    path.join(directory, 'qualification.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 }
  );
}
