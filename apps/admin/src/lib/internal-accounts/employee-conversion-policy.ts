import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseManagedAccountAddress } from './managed-address';

const IdentitySnapshotSchema = z
  .object({
    authUserId: z.guid(),
    email: z.string(),
    providerFingerprint: z.string().min(1),
    registryRevision: z.number().int().nonnegative(),
    immutableStateFingerprint: z.string().min(1),
  })
  .strict();
const ConversionInputSchema = z
  .object({
    operationId: z.guid(),
    now: z.number().finite().nonnegative(),
    authority: z
      .object({
        actorId: z.guid(),
        verifiedRootAdministrator: z.boolean(),
        revision: z.number().int().positive(),
        expectedRevision: z.number().int().positive(),
        expiresAt: z.number().finite(),
        revoked: z.boolean(),
      })
      .strict(),
    lease: z
      .object({
        id: z.guid(),
        ownerActorId: z.guid(),
        fencingToken: z.number().int().positive(),
        expectedFencingToken: z.number().int().positive(),
        expiresAt: z.number().finite(),
      })
      .strict(),
    expected: IdentitySnapshotSchema,
    current: IdentitySnapshotSchema,
    destination: z.string(),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('unknown') }).strict(),
      z.object({ kind: z.literal('absent') }).strict(),
      z.object({ kind: z.literal('owned'), authUserId: z.guid() }).strict(),
    ]),
    priorOperation: z
      .object({
        operationId: z.guid(),
        payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();

/** A proposed protected-adapter contract, not installed provider authority. */
export type ManagedAddressIntent = Readonly<{
  operationId: string;
  actorId: string;
  authUserId: string;
  sourceAddress: string;
  destinationAddress: string;
  registryRevision: number;
  providerFingerprint: string;
  immutableStateFingerprint: string;
  authorityRevision: number;
  leaseId: string;
  fencingToken: number;
  payloadHash: string;
}>;

export type ProviderVerifiedAddressControl = Readonly<{
  providerId: string;
  domain: string;
  authorityId: string;
  ownershipRevision: number;
  observedAt: number;
  expiresAt: number;
  permittedOperation: 'managed_alias_forward';
  routeGraphFingerprint: string;
}>;

export type ManagedConversionProgress =
  | { kind: 'reserved'; intent: ManagedAddressIntent }
  | {
      kind: 'provider_outcome_unknown';
      intent: ManagedAddressIntent;
      receiptId: string;
    }
  | {
      kind: 'auth_changed_forwarding_pending';
      intent: ManagedAddressIntent;
      authReceiptId: string;
    }
  | {
      kind: 'effects_verified_registry_pending';
      intent: ManagedAddressIntent;
      authReceiptId: string;
      forwardingReceiptId: string;
    }
  | {
      kind: 'confirmed';
      intent: ManagedAddressIntent;
      authReceiptId: string;
      forwardingReceiptId: string;
      registryReceiptId: string;
    };

export type ConversionDecision =
  | {
      kind: 'denied';
      reason:
        | 'invalid_input'
        | 'administrator_unavailable'
        | 'lease_unavailable'
        | 'external_source'
        | 'destination_not_root'
        | 'target_unverified';
    }
  | {
      kind: 'conflict';
      reason:
        | 'identity_changed'
        | 'source_changed'
        | 'provider_changed'
        | 'registry_changed'
        | 'immutable_state_changed'
        | 'target_owned_by_another_identity'
        | 'operation_payload_changed';
    }
  | { kind: 'already_canonical'; authUserId: string }
  | { kind: 'eligible'; intent: ManagedAddressIntent; replay: boolean };

/** Pure eligibility only. Callers must supply freshly verified server snapshots. */
export function evaluateEmployeeConversion(input: unknown): ConversionDecision {
  const parsed = ConversionInputSchema.safeParse(input);
  if (!parsed.success) return { kind: 'denied', reason: 'invalid_input' };
  const value = parsed.data;
  const { authority, lease, current, expected, now } = value;
  if (
    !authority.verifiedRootAdministrator ||
    authority.revoked ||
    authority.expiresAt <= now ||
    authority.revision !== authority.expectedRevision
  ) {
    return { kind: 'denied', reason: 'administrator_unavailable' };
  }
  if (
    lease.ownerActorId !== authority.actorId ||
    lease.expiresAt <= now ||
    lease.fencingToken !== lease.expectedFencingToken
  ) {
    return { kind: 'denied', reason: 'lease_unavailable' };
  }
  if (current.authUserId !== expected.authUserId)
    return { kind: 'conflict', reason: 'identity_changed' };
  if (current.email !== expected.email)
    return { kind: 'conflict', reason: 'source_changed' };
  if (current.providerFingerprint !== expected.providerFingerprint)
    return { kind: 'conflict', reason: 'provider_changed' };
  if (current.registryRevision !== expected.registryRevision)
    return { kind: 'conflict', reason: 'registry_changed' };
  if (current.immutableStateFingerprint !== expected.immutableStateFingerprint)
    return { kind: 'conflict', reason: 'immutable_state_changed' };
  const source = parseManagedAccountAddress(current.email);
  if (!source) return { kind: 'denied', reason: 'external_source' };
  const destination = parseManagedAccountAddress(value.destination);
  if (!destination?.isRoot)
    return { kind: 'denied', reason: 'destination_not_root' };
  if (value.target.kind === 'unknown')
    return { kind: 'denied', reason: 'target_unverified' };
  if (
    value.target.kind === 'owned' &&
    value.target.authUserId !== current.authUserId
  ) {
    return { kind: 'conflict', reason: 'target_owned_by_another_identity' };
  }
  const binding = {
    operationId: value.operationId,
    actorId: authority.actorId,
    authUserId: current.authUserId,
    sourceAddress: source.address,
    destinationAddress: destination.address,
    registryRevision: current.registryRevision,
    providerFingerprint: current.providerFingerprint,
    immutableStateFingerprint: current.immutableStateFingerprint,
    authorityRevision: authority.revision,
    leaseId: lease.id,
    fencingToken: lease.fencingToken,
  };
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(binding))
    .digest('hex');
  if (
    value.priorOperation &&
    (value.priorOperation.operationId !== value.operationId ||
      value.priorOperation.payloadHash !== payloadHash)
  ) {
    return { kind: 'conflict', reason: 'operation_payload_changed' };
  }
  // A canonical observation must not acknowledge an unrelated operation.
  if (source.address === destination.address) {
    return value.target.kind === 'owned'
      ? { kind: 'already_canonical', authUserId: current.authUserId }
      : { kind: 'denied', reason: 'target_unverified' };
  }
  return {
    kind: 'eligible',
    intent: Object.freeze({ ...binding, payloadHash }),
    replay: Boolean(value.priorOperation),
  };
}
