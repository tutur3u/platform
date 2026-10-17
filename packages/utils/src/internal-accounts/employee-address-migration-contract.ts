import { z } from 'zod';
import { parseManagedAccountAddress } from './managed-address';

const Revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const CanonicalUuid = z.uuid().refine((value) => value === value.toLowerCase());
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const AddressMigrationRequest = z
  .strictObject({
    operationId: CanonicalUuid,
    actorId: CanonicalUuid,
    userId: CanonicalUuid,
    sourceAddress: z.string(),
    destinationAddress: z.string(),
    expectedRevision: Revision.max(Number.MAX_SAFE_INTEGER - 1),
  })
  .superRefine((value, context) => {
    const source = parseManagedAccountAddress(value.sourceAddress);
    const destination = parseManagedAccountAddress(value.destinationAddress);
    if (
      !source ||
      source.isRoot ||
      !destination?.isRoot ||
      source.address !== value.sourceAddress ||
      destination.address !== value.destinationAddress ||
      source.address.split('@')[0] !== destination.address.split('@')[0] ||
      value.actorId === value.userId
    )
      context.addIssue({
        code: 'custom',
        message: 'Invalid managed address migration tuple',
      });
  });
export type AddressMigrationRequest = z.infer<typeof AddressMigrationRequest>;
export const MigrationBinding = z.strictObject({
  ...AddressMigrationRequest.shape,
  immutableFingerprint: Fingerprint,
  providerIdentityFingerprint: Fingerprint,
});
export type MigrationBinding = z.infer<typeof MigrationBinding>;
export const MigrationRecord = z
  .strictObject({
    binding: MigrationBinding,
    phase: z.enum(['reserved', 'attempted', 'completed']),
    attemptId: CanonicalUuid.nullable(),
  })
  .superRefine((value, context) => {
    if ((value.phase === 'reserved') !== (value.attemptId === null)) {
      context.addIssue({ code: 'custom', message: 'Invalid attempt marker' });
    }
  });
export type MigrationRecord = z.infer<typeof MigrationRecord>;
export const MigrationInspection = z.strictObject({
  authorized: z.boolean(),
  revision: Revision,
  immutableFingerprint: Fingerprint,
  providerIdentityFingerprint: Fingerprint,
  sourceVerified: z.boolean(),
  // Includes Auth, public profile, mailbox aliases and CREATE/RESTORE reservations.
  addressOwnership: z.enum([
    'available',
    'same_identity',
    'conflict',
    'unknown',
  ]),
  record: MigrationRecord.nullable(),
});
export type MigrationInspection = z.infer<typeof MigrationInspection>;
export const MigrationProviderObservation = z.strictObject({
  userId: CanonicalUuid,
  email: z.string(),
  emailVerified: z.boolean(),
  active: z.boolean(),
  providerIdentityFingerprint: Fingerprint,
});
export type MigrationProviderObservation = z.infer<
  typeof MigrationProviderObservation
>;

/** Protected suppliers must authenticate a fresh confirmed active root admin,
 * lock/recheck the exact actor/target/address tuple and all reservations in every
 * transaction, and retain the original binding permanently. reserve is idempotent;
 * claimAttempt atomically permits one winner and never reissues a capability.
 * Reads MUST use separate committed transactions, never the write response.
 * complete must independently verify Auth/identities, unchanged public UUID,
 * memberships/data and approved mailbox routing before atomic registry/profile
 * address changes. No supplier is installed by this source contract.
 */
export type AddressMigrationJournal = {
  inspect(request: AddressMigrationRequest): Promise<unknown>;
  reserve(binding: MigrationBinding): Promise<unknown>;
  claimAttempt(binding: MigrationBinding, attemptId: string): Promise<unknown>;
  complete(binding: MigrationBinding): Promise<unknown>;
};
export type AddressMigrationProvider = {
  read(userId: string): Promise<unknown>;
  // Must make one supported updateUserById call with { email } only. Never set
  // email_confirm, metadata, passwords, grants, ban state, or identity IDs.
  changeEmail(userId: string, destinationAddress: string): Promise<void>;
};
export type AddressMigrationPorts = {
  journal: AddressMigrationJournal;
  provider: AddressMigrationProvider;
  newAttemptId(): string;
};
export type AddressMigrationResult =
  | {
      status: 'denied';
      code: 'invalid_input' | 'forbidden' | 'conflict' | 'not_ready';
    }
  | { status: 'pending'; operationId: string; nextAction: 'inspect' }
  | { status: 'completed'; operationId: string; userId: string; email: string };

export function sameMigrationBinding(
  left: MigrationBinding,
  right: MigrationBinding
) {
  return (
    left.operationId === right.operationId &&
    left.actorId === right.actorId &&
    left.userId === right.userId &&
    left.sourceAddress === right.sourceAddress &&
    left.destinationAddress === right.destinationAddress &&
    left.expectedRevision === right.expectedRevision &&
    left.immutableFingerprint === right.immutableFingerprint &&
    left.providerIdentityFingerprint === right.providerIdentityFingerprint
  );
}
