import { z } from 'zod';

export const EmployeeOperationIdentitySchema = z
  .object({
    actorUserId: z.uuid(),
    operationId: z.uuid(),
    email: z
      .string()
      .email()
      .max(320)
      .regex(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@tuturuuu\.com$/),
    displayName: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => value === value.trim()),
  })
  .strict();
export type EmployeeOperationIdentity = z.infer<
  typeof EmployeeOperationIdentitySchema
>;
export const EmployeeOperationPhaseSchema = z.enum([
  'reserved',
  'auth_attempted',
  'auth_confirmed',
  'finalize_attempted',
  'provisioned',
  'activation_attempted',
  'active',
  'unknown',
]);
export type EmployeeOperationPhase = z.infer<
  typeof EmployeeOperationPhaseSchema
>;
export const EmployeePhaseReceiptSchema = z
  .object({
    targetUserId: z.uuid(),
    email: z.email(),
    providerReceiptId: z.uuid(),
    authConfirmed: z.boolean(),
    authPending: z.boolean(),
    providerActive: z.boolean(),
    sqlConfirmed: z.boolean(),
    profilesConfirmed: z.boolean(),
    mailboxConfirmed: z.boolean(),
    grantsConfirmed: z.boolean(),
  })
  .strict();
export type EmployeePhaseReceipt = z.infer<typeof EmployeePhaseReceiptSchema>;
export const EmployeeOperationSnapshotSchema =
  EmployeeOperationIdentitySchema.extend({
    targetUserId: z.uuid(),
    phase: EmployeeOperationPhaseSchema,
    version: z.number().int().nonnegative(),
    leaseId: z.uuid().nullable(),
    leaseExpiresAt: z.number().int().nonnegative(),
    revoked: z.boolean(),
    lastReceipt: EmployeePhaseReceiptSchema.nullable(),
  }).strict();
export type EmployeeOperationSnapshot = z.infer<
  typeof EmployeeOperationSnapshotSchema
>;
const ClaimSchema = z
  .object({
    kind: z.enum(['claimed', 'inspect', 'payload_conflict']),
    operation: EmployeeOperationSnapshotSchema,
  })
  .strict();
const AdvanceSchema = z
  .object({
    kind: z.enum(['advanced', 'inspect']),
    operation: EmployeeOperationSnapshotSchema,
  })
  .strict();
const AuthoritySchema = z
  .object({
    actorUserId: z.uuid(),
    workspaceId: z.literal('00000000-0000-0000-0000-000000000000'),
    membership: z.literal('MEMBER'),
    permission: z.enum(['admin', 'manage_internal_accounts']),
    email: z.string().email().endsWith('@tuturuuu.com'),
    emailConfirmed: z.literal(true),
    unbanned: z.literal(true),
    observedAt: z.number().int(),
    expiresAt: z.number().int(),
  })
  .strict();
export type EmployeeOperationAuthority = z.infer<typeof AuthoritySchema>;
export type EmployeeOperationAdvance = {
  actorUserId: string;
  operationId: string;
  leaseId: string;
  expectedVersion: number;
  eventId: string;
  nextPhase: EmployeeOperationPhase;
  receipt: EmployeePhaseReceipt | null;
};
/** Implement with qualified generated RPC types after root schema admission.
 * Mutations resolve only after actual COMMIT acknowledgement; function JSON alone
 * is insufficient. Inspection must return this transaction's locked snapshot.
 * No production adapter or permissive Supabase rpc cast is supplied here. */
export type EmployeeCreationOperationRpc = {
  ready(actorUserId: string): Promise<unknown>;
  claim(identity: EmployeeOperationIdentity): Promise<unknown>;
  advance(input: EmployeeOperationAdvance): Promise<unknown>;
  revoke(input: { actorUserId: string; operationId: string }): Promise<unknown>;
};
export class EmployeeOperationStoreError extends Error {
  constructor(
    readonly code: 'authority_denied' | 'unavailable' | 'invalid_receipt',
    readonly lastKnown: EmployeeOperationSnapshot | null = null
  ) {
    super(code);
  }
}
function sameReceipt(
  left: EmployeePhaseReceipt | null,
  right: EmployeePhaseReceipt | null
) {
  if (left === null || right === null) return left === right;
  return (
    left.targetUserId === right.targetUserId &&
    left.email === right.email &&
    left.providerReceiptId === right.providerReceiptId &&
    left.authConfirmed === right.authConfirmed &&
    left.authPending === right.authPending &&
    left.providerActive === right.providerActive &&
    left.sqlConfirmed === right.sqlConfirmed &&
    left.profilesConfirmed === right.profilesConfirmed &&
    left.mailboxConfirmed === right.mailboxConfirmed &&
    left.grantsConfirmed === right.grantsConfirmed
  );
}
export function createEmployeeCreationOperationStore(input: {
  rpc: EmployeeCreationOperationRpc;
  authorize(actorUserId: string): Promise<unknown>;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  function freshAuthority(
    proof: EmployeeOperationAuthority,
    actorUserId: string,
    lastKnown: EmployeeOperationSnapshot | null = null
  ) {
    const time = now();
    if (
      !Number.isFinite(time) ||
      proof.actorUserId !== actorUserId ||
      proof.observedAt > time ||
      proof.expiresAt <= time ||
      proof.expiresAt - proof.observedAt > 60_000 ||
      time - proof.observedAt > 60_000
    )
      throw new EmployeeOperationStoreError('authority_denied', lastKnown);
    return time;
  }
  async function authority(
    actorUserId: string,
    lastKnown: EmployeeOperationSnapshot | null = null
  ) {
    let proof: unknown;
    try {
      proof = await input.authorize(actorUserId);
    } catch {
      throw new EmployeeOperationStoreError('authority_denied', lastKnown);
    }
    const parsed = AuthoritySchema.safeParse(proof);
    if (!parsed.success)
      throw new EmployeeOperationStoreError('authority_denied', lastKnown);
    freshAuthority(parsed.data, actorUserId, lastKnown);
    return parsed.data;
  }
  function bind(
    operation: EmployeeOperationSnapshot,
    identity: Pick<EmployeeOperationIdentity, 'actorUserId' | 'operationId'>,
    lastKnown: EmployeeOperationSnapshot | null = null
  ) {
    if (
      operation.actorUserId !== identity.actorUserId ||
      operation.operationId !== identity.operationId
    )
      throw new EmployeeOperationStoreError('invalid_receipt', lastKnown);
    const receipt = operation.lastReceipt;
    if (
      receipt &&
      (receipt.targetUserId !== operation.targetUserId ||
        receipt.email !== operation.email)
    )
      throw new EmployeeOperationStoreError('invalid_receipt', lastKnown);
    return operation;
  }
  return {
    async assertAuthority(operation: EmployeeOperationSnapshot) {
      const proof = await authority(operation.actorUserId, operation);
      if (
        ![
          'auth_attempted',
          'finalize_attempted',
          'activation_attempted',
        ].includes(operation.phase)
      )
        throw new EmployeeOperationStoreError('unavailable', operation);
      // Existing attempted keys are inspected under the SQL row lock after the
      // final actor await. This is admission observation, not provider cancellation.
      let reply: unknown;
      try {
        reply = await input.rpc.claim({
          actorUserId: operation.actorUserId,
          operationId: operation.operationId,
          email: operation.email,
          displayName: operation.displayName,
        });
      } catch {
        throw new EmployeeOperationStoreError('unavailable', operation);
      }
      const parsed = ClaimSchema.safeParse(reply);
      if (!parsed.success || parsed.data.kind !== 'inspect')
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      const current = bind(parsed.data.operation, operation, operation);
      if (
        current.targetUserId !== operation.targetUserId ||
        current.email !== operation.email ||
        current.displayName !== operation.displayName
      )
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      const time = freshAuthority(proof, operation.actorUserId, current);
      if (
        current.revoked ||
        current.leaseExpiresAt <= time ||
        !current.leaseId ||
        current.leaseId !== operation.leaseId ||
        current.leaseExpiresAt !== operation.leaseExpiresAt ||
        current.version !== operation.version ||
        current.phase !== operation.phase ||
        !sameReceipt(current.lastReceipt, operation.lastReceipt)
      )
        throw new EmployeeOperationStoreError('unavailable', current);
      return current;
    },
    async available(actorUserId: string) {
      try {
        await authority(z.uuid().parse(actorUserId));
        return z
          .object({ ready: z.literal(true) })
          .strict()
          .safeParse(await input.rpc.ready(actorUserId)).success;
      } catch {
        return false;
      }
    },
    async claim(identity: EmployeeOperationIdentity) {
      const value = EmployeeOperationIdentitySchema.parse(identity);
      await authority(value.actorUserId);
      const parsed = ClaimSchema.safeParse(await input.rpc.claim(value));
      if (!parsed.success)
        throw new EmployeeOperationStoreError('invalid_receipt');
      const operation = bind(parsed.data.operation, value);
      if (
        parsed.data.kind !== 'payload_conflict' &&
        (operation.email !== value.email ||
          operation.displayName !== value.displayName)
      )
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      if (
        parsed.data.kind === 'claimed' &&
        (operation.phase !== 'reserved' ||
          !operation.leaseId ||
          operation.revoked ||
          operation.leaseExpiresAt <= now())
      )
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      return { kind: parsed.data.kind, operation };
    },
    async advance(
      operation: EmployeeOperationSnapshot,
      nextPhase: EmployeeOperationPhase,
      receipt: EmployeePhaseReceipt | null,
      eventId: string
    ) {
      await authority(operation.actorUserId, operation);
      if (!operation.leaseId)
        throw new EmployeeOperationStoreError('unavailable', operation);
      const submittedReceipt =
        receipt === null ? null : EmployeePhaseReceiptSchema.parse(receipt);
      const parsed = AdvanceSchema.safeParse(
        await input.rpc.advance({
          actorUserId: operation.actorUserId,
          operationId: operation.operationId,
          leaseId: operation.leaseId,
          expectedVersion: operation.version,
          eventId: z.uuid().parse(eventId),
          nextPhase,
          receipt: submittedReceipt,
        })
      );
      if (!parsed.success)
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      const updated = bind(parsed.data.operation, operation, operation);
      if (
        updated.targetUserId !== operation.targetUserId ||
        updated.email !== operation.email ||
        updated.displayName !== operation.displayName ||
        (parsed.data.kind === 'advanced' &&
          (updated.phase !== nextPhase ||
            updated.version !== operation.version + 1 ||
            updated.leaseId !== operation.leaseId ||
            updated.leaseExpiresAt !== operation.leaseExpiresAt ||
            updated.revoked ||
            !sameReceipt(
              updated.lastReceipt,
              submittedReceipt ?? operation.lastReceipt
            )))
      )
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      return { kind: parsed.data.kind, operation: updated };
    },
    async revoke(operation: EmployeeOperationSnapshot) {
      await authority(operation.actorUserId, operation);
      const value = EmployeeOperationSnapshotSchema.parse(
        await input.rpc.revoke({
          actorUserId: operation.actorUserId,
          operationId: operation.operationId,
        })
      );
      const updated = bind(value, operation, operation);
      if (
        !updated.revoked ||
        updated.targetUserId !== operation.targetUserId ||
        updated.email !== operation.email ||
        updated.displayName !== operation.displayName
      )
        throw new EmployeeOperationStoreError('invalid_receipt', operation);
      return updated;
    },
  };
}
export type EmployeeCreationOperationStore = ReturnType<
  typeof createEmployeeCreationOperationStore
>;
