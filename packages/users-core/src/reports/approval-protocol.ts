import { z } from 'zod';

const uuid = z
  .uuid()
  .length(36)
  .refine((value) => value === value.toLowerCase());
const revision = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => value === value.trim())
  .refine((value) => value.length < 19 || value <= '9223372036854775807');
const digest = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/);
const versionLabel = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
  .refine((value) => value === value.trim());
const selectionSchema = z.strictObject({
  reportId: uuid,
  expectedRevision: revision,
});
const requestSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('periodic'),
  actionId: uuid,
  workspaceId: uuid,
  selections: z.array(selectionSchema).min(1).max(50),
});
const contextSchema = z.strictObject({
  actorAuthUid: uuid,
  actorWorkspaceUserId: uuid,
  workspaceId: uuid,
});
const entrySchema = z.strictObject({
  reportId: uuid,
  observedRevision: revision,
  reviewRevision: revision,
  receiptRevision: revision,
  receiptId: uuid,
  fullReviewInputDigest: digest,
  presentationDigest: digest,
  recipientDigest: digest,
});
const resultSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal('periodic'),
  actionId: uuid,
  workspaceId: uuid,
  actorAuthUid: uuid,
  actorWorkspaceUserId: uuid,
  replayed: z.boolean(),
  rendererVersion: versionLabel,
  entries: z.array(entrySchema).min(1).max(50),
});

export type ApprovalSelection = Readonly<z.infer<typeof selectionSchema>>;
export type PeriodicApprovalRequest = Readonly<
  Omit<z.infer<typeof requestSchema>, 'selections'> & {
    selections: readonly ApprovalSelection[];
  }
>;
export type PeriodicApprovalEntry = Readonly<z.infer<typeof entrySchema>>;
export type PeriodicApprovalResult = Readonly<
  Omit<z.infer<typeof resultSchema>, 'entries'> & {
    entries: readonly PeriodicApprovalEntry[];
  }
>;
/** A future verified backend must construct this context. This pure unit cannot authenticate it. */
export type ApprovalComparisonContext = Readonly<z.infer<typeof contextSchema>>;

export type ApprovalProtocolFailure =
  | 'invalid_request'
  | 'invalid_context'
  | 'invalid_result'
  | 'scope_mismatch'
  | 'incomplete_result'
  | 'revision_mismatch';
export class ApprovalProtocolError extends Error {
  constructor(readonly category: ApprovalProtocolFailure) {
    super('Approval protocol validation failed.');
    this.name = 'ApprovalProtocolError';
  }
}

/** Unwired: validates an explicit snapshot, without approving, authenticating or queuing anything. */
export function parsePeriodicApprovalRequest(
  input: unknown
): PeriodicApprovalRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new ApprovalProtocolError('invalid_request');
  if (
    new Set(parsed.data.selections.map((selection) => selection.reportId))
      .size !== parsed.data.selections.length
  )
    throw new ApprovalProtocolError('invalid_request');
  return Object.freeze({
    ...parsed.data,
    selections: Object.freeze(
      parsed.data.selections.map((selection) => Object.freeze(selection))
    ),
  });
}

/**
 * Unwired shape/identity validation only. Digest format is not encoding proof.
 * Replay still requires current permission/revision checks by the future canonical backend.
 */
export function parsePeriodicApprovalResult(
  input: unknown,
  requested: PeriodicApprovalRequest,
  admittedContext: ApprovalComparisonContext
): PeriodicApprovalResult {
  const request = parsePeriodicApprovalRequest(requested);
  const context = contextSchema.safeParse(admittedContext);
  if (!context.success) throw new ApprovalProtocolError('invalid_context');
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) throw new ApprovalProtocolError('invalid_result');
  const result = parsed.data;
  if (
    result.actionId !== request.actionId ||
    result.workspaceId !== request.workspaceId ||
    context.data.workspaceId !== request.workspaceId ||
    result.actorAuthUid !== context.data.actorAuthUid ||
    result.actorWorkspaceUserId !== context.data.actorWorkspaceUserId
  )
    throw new ApprovalProtocolError('scope_mismatch');
  const expected = new Map(
    request.selections.map((selection) => [
      selection.reportId,
      selection.expectedRevision,
    ])
  );
  if (
    result.entries.length !== expected.size ||
    new Set(result.entries.map((entry) => entry.reportId)).size !==
      expected.size ||
    new Set(result.entries.map((entry) => entry.receiptId)).size !==
      expected.size
  )
    throw new ApprovalProtocolError('incomplete_result');
  for (const entry of result.entries) {
    const observed = expected.get(entry.reportId);
    if (observed === undefined)
      throw new ApprovalProtocolError('incomplete_result');
    if (
      entry.observedRevision !== observed ||
      BigInt(entry.reviewRevision) <= BigInt(observed) ||
      entry.receiptRevision !== entry.reviewRevision
    )
      throw new ApprovalProtocolError('revision_mismatch');
  }
  return Object.freeze({
    ...result,
    entries: Object.freeze(result.entries.map((entry) => Object.freeze(entry))),
  });
}
