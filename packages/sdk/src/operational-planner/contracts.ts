import { z } from 'zod';
import { slug, text } from '../cli/operational-schema';
import {
  outcomeProjectionPageSchema,
  outcomeSnapshotSchema,
} from '../operational-graph/contracts';

export const plannerIdentitySchema = z
  .object({
    sourceDatabaseId: z.uuid(),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type PlannerIdentity = z.infer<typeof plannerIdentitySchema>;

const reservationBase = z
  .object({
    identity: plannerIdentitySchema,
    canonicalItemId: slug,
    reservationId: z.uuid(),
  })
  .strict();
export const plannerReservationSchema = z.discriminatedUnion('kind', [
  reservationBase.extend({ kind: z.literal('reserved'), owner: text }),
  reservationBase.extend({ kind: z.literal('unreserved') }),
]);
export const plannerGrantSchema = z
  .object({
    identity: plannerIdentitySchema,
    grantId: z.uuid(),
    canonicalItemId: slug,
    reservationId: z.uuid(),
    owner: text,
    action: z.literal('compare-and-create'),
    allowed: z.boolean(),
  })
  .strict();

// This is a trusted coordinator-reader boundary, not a caller-issued grant.
export const plannerContextSchema = z
  .object({
    snapshot: outcomeSnapshotSchema,
    graph: outcomeProjectionPageSchema,
    expected: plannerIdentitySchema,
    reservations: z.array(plannerReservationSchema).max(500),
    grant: plannerGrantSchema,
    globalP0Hold: z.boolean(),
  })
  .strict();
export type PlannerContext = z.infer<typeof plannerContextSchema>;

export const advisoryScoresSchema = z
  .array(
    z
      .object({
        canonicalItemId: slug,
        score: z.number().finite(),
      })
      .strict()
  )
  .max(500);

export const assignmentRequestSchema = z
  .object({
    operationId: z.uuid(),
    expected: plannerIdentitySchema,
    canonicalItemId: slug,
    owner: text,
    grantId: z.uuid(),
    reservationId: z.uuid(),
    // Untrusted search/model output has no part in admission or request identity.
    recommendation: z.unknown().optional(),
  })
  .strict();

export const assignmentCommandSchema = assignmentRequestSchema
  .omit({ recommendation: true })
  .extend({ requestDigest: z.string().regex(/^[0-9a-f]{64}$/) });
export type AssignmentCommand = z.infer<typeof assignmentCommandSchema>;
export const assignmentTimeoutSchema = z.number().int().min(1).max(60_000);

export const assignmentReceiptSchema = z
  .object({
    kind: z.enum(['created', 'replayed']),
    operationId: z.uuid(),
    requestDigest: z.string().regex(/^[0-9a-f]{64}$/),
    sourceDatabaseId: z.uuid(),
    canonicalItemId: slug,
    taskId: text,
    receiptId: text,
  })
  .strict();
export type AssignmentReceipt = z.infer<typeof assignmentReceiptSchema>;

export const atomicAssignmentResultSchema = z.discriminatedUnion('kind', [
  assignmentReceiptSchema.extend({ kind: z.literal('created') }),
  assignmentReceiptSchema.extend({ kind: z.literal('replayed') }),
  z.object({ kind: z.literal('conflict'), reason: text }).strict(),
  z.object({ kind: z.literal('denied'), reason: text }).strict(),
]);
export type AtomicAssignmentResult = z.infer<
  typeof atomicAssignmentResultSchema
>;

/**
 * A production adapter must execute one durable transaction:
 * - Authenticate the coordinator grant and reservation owner, reread the source,
 *   and recheck the full identity, graph eligibility, hold, reservation and grant.
 * - Enforce UNIQUE(sourceDatabaseId, canonicalItemId), and operationId identity.
 * - Recompute requestDigest from the command without requestDigest; never trust
 *   a caller-supplied digest or recommendation as authorization.
 * - Persist task uniqueness and the operation digest/receipt atomically.
 * - Exact replay returns the original taskId/receiptId. A changed digest conflicts;
 *   a different operation cannot create a second task for the same source item.
 *
 * The port owns authoritative authorization and transaction isolation. The local
 * preflight is advisory protection only. No in-memory fixture proves crash safety.
 * A timeout cannot prove rollback; reconcile the original operation and digest.
 */
export interface AtomicAssignmentPort {
  compareAndCreate(command: Readonly<AssignmentCommand>): Promise<unknown>;
}

export type AssignmentOutcome =
  | AtomicAssignmentResult
  | { kind: 'unresolved'; operationId: string; requestDigest: string }
  | { kind: 'denied'; reason: string };

export const assignmentReconciliationRequestSchema = z
  .object({
    originalRequest: assignmentRequestSchema,
    requestDigest: assignmentCommandSchema.shape.requestDigest,
  })
  .strict();
export const assignmentInspectionScopeSchema = z
  .object({
    sourceDatabaseId: z.uuid(),
    canonicalItemId: slug,
    operationId: z.uuid(),
  })
  .strict();
export type AssignmentInspectionScope = z.infer<
  typeof assignmentInspectionScopeSchema
>;

// Only a trusted current policy reader can supply this value. Caller request
// fields, historical create grants and reservations never grant inspection rights.
export const assignmentInspectionAuthorizationSchema = z
  .object({
    action: z.literal('assignment-reconcile'),
    principal: z.object({ id: z.uuid(), authenticated: z.boolean() }).strict(),
    scope: assignmentInspectionScopeSchema,
    policy: z
      .object({
        permission: z.literal('assignment-reconcile'),
        allowed: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type AssignmentInspectionAuthorization = z.infer<
  typeof assignmentInspectionAuthorizationSchema
>;
export type AssignmentReconciliationCommand = {
  readonly original: Readonly<AssignmentCommand>;
  readonly authorization: Readonly<AssignmentInspectionAuthorization>;
};
export const assignmentReconciliationResultSchema = z.discriminatedUnion(
  'kind',
  [
    z
      .object({
        kind: z.literal('reconciled'),
        receipt: assignmentReceiptSchema,
      })
      .strict(),
    z.object({ kind: z.literal('not-found') }).strict(),
    z.object({ kind: z.literal('conflict'), reason: text }).strict(),
    z.object({ kind: z.literal('denied'), reason: text }).strict(),
  ]
);
export type AssignmentReconciliationOutcome =
  | z.infer<typeof assignmentReconciliationResultSchema>
  | { kind: 'unresolved'; operationId: string; requestDigest: string };

/**
 * READ ONLY. Independently authenticate the actual transport/session principal
 * and current inspection policy for this exact database/item/operation before
 * revealing journal existence, conflicts or receipts. A boolean authorization
 * object is not authentication; a production adapter must bind it to its trusted
 * transport identity and recheck current policy, including revocation.
 * Recompute the original digest. Look up only the original operation journal;
 * require its original operationId/digest/database/item match, returning original
 * taskId/receiptId. Changed digest conflicts; absent journal truthfully returns
 * not-found, which cannot prove a timed-out create will never commit later.
 * Never create, overwrite, change revisions/digests or call compareAndCreate.
 * Current planner/create eligibility, P0 holds, owners, reservations and create
 * grants neither authorize nor automatically deny this separately permitted read.
 */
export interface AssignmentReconciliationPort {
  readOriginalReceipt(
    command: Readonly<AssignmentReconciliationCommand>
  ): Promise<unknown>;
}
