import {
  type AddressMigrationPorts,
  AddressMigrationRequest,
  type AddressMigrationResult,
  type MigrationInspection as Inspection,
  type MigrationBinding,
  MigrationInspection,
  MigrationProviderObservation,
  type MigrationProviderObservation as ProviderObservation,
  sameMigrationBinding,
} from './employee-address-migration-contract';

function pending(operationId: string): AddressMigrationResult {
  return { status: 'pending', operationId, nextAction: 'inspect' };
}
function boundObservation(
  observation: ProviderObservation,
  binding: MigrationBinding,
  address: string
) {
  return (
    observation.userId === binding.userId &&
    observation.email === address &&
    observation.emailVerified &&
    observation.active &&
    observation.providerIdentityFingerprint ===
      binding.providerIdentityFingerprint
  );
}
function boundInspection(inspection: Inspection, binding: MigrationBinding) {
  return (
    inspection.authorized &&
    inspection.sourceVerified &&
    ['available', 'same_identity'].includes(inspection.addressOwnership) &&
    inspection.immutableFingerprint === binding.immutableFingerprint &&
    inspection.providerIdentityFingerprint ===
      binding.providerIdentityFingerprint &&
    inspection.record !== null &&
    sameMigrationBinding(inspection.record.binding, binding) &&
    inspection.revision ===
      binding.expectedRevision +
        (inspection.record.phase === 'completed' ? 1 : 0)
  );
}
async function inspect(
  ports: AddressMigrationPorts,
  request: AddressMigrationRequest
) {
  return MigrationInspection.parse(await ports.journal.inspect(request));
}
async function provider(
  ports: AddressMigrationPorts,
  request: AddressMigrationRequest
) {
  return MigrationProviderObservation.parse(
    await ports.provider.read(request.userId)
  );
}
function completed(binding: MigrationBinding): AddressMigrationResult {
  return {
    status: 'completed',
    operationId: binding.operationId,
    userId: binding.userId,
    email: binding.destinationAddress,
  };
}
async function confirm(
  ports: AddressMigrationPorts,
  binding: MigrationBinding
): Promise<AddressMigrationResult> {
  const current = await inspect(ports, binding);
  if (
    !boundInspection(current, binding) ||
    current.record?.phase === 'reserved' ||
    !boundObservation(
      await provider(ports, binding),
      binding,
      binding.destinationAddress
    )
  ) {
    return pending(binding.operationId);
  }
  if (current.record?.phase !== 'completed') {
    await ports.journal.complete(binding);
  }
  const persisted = await inspect(ports, binding);
  if (
    !boundInspection(persisted, binding) ||
    persisted.record?.phase !== 'completed' ||
    !boundObservation(
      await provider(ports, binding),
      binding,
      binding.destinationAddress
    )
  ) {
    return pending(binding.operationId);
  }
  return completed(binding);
}

/** Source-only executor. No route, runtime flag, journal or provider is bound.
 * Unknown write outcomes are inspection-only, including a lost reservation or
 * attempt acknowledgement. This function never replaces or deletes an identity.
 */
export async function migrateEmployeeAddress(
  ports: AddressMigrationPorts,
  input: unknown
): Promise<AddressMigrationResult> {
  const parsed = AddressMigrationRequest.safeParse(input);
  if (!parsed.success) return { status: 'denied', code: 'invalid_input' };
  const request = parsed.data;
  try {
    const initial = await inspect(ports, request);
    if (!initial.authorized) return { status: 'denied', code: 'forbidden' };
    if (initial.record) {
      if (
        !sameMigrationBinding(initial.record.binding, {
          ...request,
          immutableFingerprint: initial.record.binding.immutableFingerprint,
          providerIdentityFingerprint:
            initial.record.binding.providerIdentityFingerprint,
        })
      )
        return { status: 'denied', code: 'conflict' };
      // Even a merely reserved replay is inspection-only. A crashed invocation
      // cannot silently restart its provider operation.
      return await confirm(ports, initial.record.binding);
    }
    if (
      initial.revision !== request.expectedRevision ||
      !initial.sourceVerified ||
      !['available', 'same_identity'].includes(initial.addressOwnership)
    ) {
      return { status: 'denied', code: 'not_ready' };
    }
    const binding: MigrationBinding = Object.freeze({
      ...request,
      immutableFingerprint: initial.immutableFingerprint,
      providerIdentityFingerprint: initial.providerIdentityFingerprint,
    });
    if (
      !boundObservation(
        await provider(ports, request),
        binding,
        request.sourceAddress
      )
    ) {
      return { status: 'denied', code: 'not_ready' };
    }
    await ports.journal.reserve(binding);
    const reserved = await inspect(ports, request);
    if (
      !boundInspection(reserved, binding) ||
      reserved.record?.phase !== 'reserved'
    ) {
      return pending(request.operationId);
    }
    const attemptId = ports.newAttemptId();
    if (
      !AddressMigrationRequest.shape.operationId.safeParse(attemptId).success
    ) {
      return pending(request.operationId);
    }
    const claim = await ports.journal.claimAttempt(binding, attemptId);
    // The write acknowledgement conveys the one-time winner; readback alone
    // must never relaunch an attempt whose response was lost.
    if (claim !== true) return pending(request.operationId);
    const attempted = await inspect(ports, request);
    if (
      !boundInspection(attempted, binding) ||
      attempted.record?.phase !== 'attempted' ||
      attempted.record.attemptId !== attemptId ||
      !boundObservation(
        await provider(ports, request),
        binding,
        request.sourceAddress
      )
    ) {
      return pending(request.operationId);
    }
    await ports.provider.changeEmail(
      request.userId,
      request.destinationAddress
    );
    return await confirm(ports, binding);
  } catch {
    return pending(request.operationId);
  }
}

export async function inspectEmployeeAddressMigration(
  ports: AddressMigrationPorts,
  input: unknown
): Promise<AddressMigrationResult> {
  const parsed = AddressMigrationRequest.safeParse(input);
  if (!parsed.success) return { status: 'denied', code: 'invalid_input' };
  try {
    const observation = await inspect(ports, parsed.data);
    if (!observation.authorized) return { status: 'denied', code: 'forbidden' };
    const binding = observation.record?.binding;
    if (
      !binding ||
      !sameMigrationBinding(binding, {
        ...parsed.data,
        immutableFingerprint: binding.immutableFingerprint,
        providerIdentityFingerprint: binding.providerIdentityFingerprint,
      })
    )
      return pending(parsed.data.operationId);
    return await confirm(ports, binding);
  } catch {
    return pending(parsed.data.operationId);
  }
}
