import { assertQualifiedHttp as baseHttp } from './employee-http-receipt.mjs';
import {
  schemaFailureDiagnostic as baseDiagnostic,
  selectSchemaPackets as basePackets,
  schemaReceipt as baseReceipt,
} from './employee-schema-tap.mjs';

export const managedProfilePackets = [
  ['employee-managed-profile.sql', 53],
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
  const tail = input.packets.slice(-2);
  const complete =
    JSON.stringify(tail) ===
    JSON.stringify(
      managedProfilePackets.map(([file, assertions]) => ({ file, assertions }))
    );
  const receipt = baseReceipt({
    ...input,
    packets: input.packets.slice(0, -2),
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
export function schemaFailureDiagnostic(phase, ordinal, result, ...args) {
  if (!selected(args[0]) || ordinal <= basePackets(...args).length)
    return baseDiagnostic(phase, ordinal, result, ...args);
  return {
    phase,
    packetOrdinal: ordinal,
    managedProfilePacket: true,
    exitCode: result?.status ?? null,
    processError: Boolean(result?.error),
    signaled: Boolean(result?.signal),
  };
}

export function assertQualifiedHttp(value, status, restore) {
  baseHttp(value, status, restore);
  if (selected(true) && value.managedProfileQualification?.qualified !== true)
    throw new Error('Managed profile HTTP qualification incomplete');
}
