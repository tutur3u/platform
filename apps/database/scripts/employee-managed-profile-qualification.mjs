import { createHash } from 'node:crypto';
import { assertQualifiedHttp as baseHttp } from './employee-http-receipt.mjs';
import {
  assertPacketTap,
  schemaFailureDiagnostic as baseDiagnostic,
  selectSchemaPackets as basePackets,
  schemaReceipt as baseReceipt,
  failedAssertionOrdinals,
} from './employee-schema-tap.mjs';

export const managedProfilePackets = [
  ['employee-managed-profile.sql', 53],
  ['employee-admin-profile-usernames.sql', 74],
  ['employee-unmanaged-profile-usernames.sql', 100],
  ['employee-managed-profile-concurrency.sql', 10],
];
function selected(journal) {
  const value = process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
  if (
    ![undefined, 'false', 'true'].includes(value) ||
    (value === 'true' && !journal)
  )
    throw new Error('Managed profile qualification requires employee journal');
  return value === 'true';
}
export function selectSchemaPackets(...args) {
  const packets = basePackets(...args);
  return selected(args[0]) ? [...packets, ...managedProfilePackets] : packets;
}
export function schemaReceipt(input) {
  if (!selected(input.journal)) return baseReceipt(input);
  const tail = input.packets.slice(-managedProfilePackets.length);
  const complete =
    JSON.stringify(tail) ===
    JSON.stringify(
      managedProfilePackets.map(([file, assertions]) => ({ file, assertions }))
    );
  const receipt = baseReceipt({
    ...input,
    packets: input.packets.slice(0, -managedProfilePackets.length),
  });
  return {
    ...receipt,
    scope: `${receipt.scope}-managed-profile`,
    schemaQualified:
      receipt.schemaQualified &&
      /^[a-f0-9]{64}$/.test(input.generatedTypesSha256 ?? '') &&
      complete,
    assertions: receipt.assertions + tail.reduce((n, p) => n + p.assertions, 0),
    packets: input.packets,
    managedProfileQualified:
      receipt.schemaQualified &&
      /^[a-f0-9]{64}$/.test(input.generatedTypesSha256 ?? '') &&
      complete,
  };
}
export function schemaFailureDiagnostic(phase, ordinal, result = {}, ...args) {
  const baseCount = basePackets(...args).length;
  if (!selected(args[0]) || ordinal <= baseCount)
    return baseDiagnostic(phase, ordinal, result, ...args);
  const packet = managedProfilePackets[ordinal - baseCount - 1];
  if (!Number.isInteger(ordinal) || !packet)
    throw new Error('Invalid managed profile diagnostic binding');
  // Reuse the canonical process/error redaction without its base-packet TAP count.
  const processDiagnostic = baseDiagnostic(
    phase,
    0,
    { ...result, stdout: '' },
    ...args
  );
  const bounded =
    typeof result.stdout === 'string' &&
    Buffer.byteLength(result.stdout, 'utf8') <= 1024 * 1024;
  const tap = bounded ? result.stdout : '';
  const lines = tap.split(/\r?\n/u);
  const plans = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
  const plan = plans.length === 1 ? Number(plans[0][1]) : null;
  let failedOrdinals = [];
  let ordinalEvidenceValid = bounded;
  let packetTapValid = false;
  try {
    failedOrdinals = failedAssertionOrdinals(tap, packet[1]);
  } catch {
    ordinalEvidenceValid = false;
  }
  if (bounded) {
    try {
      assertPacketTap(tap, packet[1]);
      packetTapValid = true;
    } catch {
      /* Capture rejection without relaxing it. */
    }
  }
  return {
    ...processDiagnostic,
    packetOrdinal: ordinal,
    managedProfilePacket: true,
    expectedAssertions: packet[1],
    stdoutBounded: bounded,
    stdoutSha256: bounded
      ? createHash('sha256').update(tap).digest('hex')
      : null,
    observedPlanCount: Math.min(plans.length, 501),
    observedPlannedAssertions:
      Number.isSafeInteger(plan) && plan >= 0 && plan <= 500 ? plan : null,
    observedAssertionCount: Math.min(
      lines.filter((line) => /^(?:not )?ok\b/u.test(line)).length,
      501
    ),
    beginTagCount: Math.min(
      lines.filter((line) => line === 'BEGIN').length,
      501
    ),
    commitTagCount: Math.min(
      lines.filter((line) => line === 'COMMIT').length,
      501
    ),
    rollbackTagCount: Math.min(
      lines.filter((line) => line === 'ROLLBACK').length,
      501
    ),
    failedAssertionOrdinals: failedOrdinals,
    assertionOrdinalsValid: ordinalEvidenceValid,
    failingAssertions: Math.min(
      lines.filter((line) => /^not ok\b/u.test(line)).length,
      501
    ),
    bailout: /^Bail out!/mu.test(tap),
    skippedOrTodo: /#\s*(?:SKIP|TODO)\b/iu.test(tap),
    packetTapValid,
  };
}

export function assertQualifiedHttp(value, status, restore) {
  baseHttp(value, status, restore);
  if (
    selected(true) &&
    (value.managedProfileQualification?.qualified !== true ||
      value.managedProfileQualification.unmanagedProfileQualification
        ?.qualified !== true ||
      value.managedProfileQualification.unmanagedProfileQualification
        .version !== 1)
  )
    throw new Error('Managed profile HTTP qualification incomplete');
}
