import { CiteWorkSchema } from '@tuturuuu/cite';
import { z } from 'zod';

export const CITE_AI_FEATURE = 'cite_fix_ref';
export const CITE_AI_OPERATION_MAX_AGE_MS = 15 * 60 * 1000;
export const CITE_AI_OPERATION_FUTURE_TOLERANCE_MS = 60 * 1000;
export const CITE_AI_RECEIPT_SECONDS = 60 * 60;
export const citationFixRequestSchema = z
  .object({
    operationId: z
      .string()
      .toLowerCase()
      .regex(
        /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
      ),
    input: z.string().trim().min(1).max(16000),
    existingWork: CiteWorkSchema.optional(),
  })
  .strict();
export type CitationFixRequest = z.infer<typeof citationFixRequestSchema>;

export const identifierFieldSchema = z.enum(['doi', 'isbn', 'arxivId', 'pmid']);
export type IdentifierField = z.infer<typeof identifierFieldSchema>;
export const citationFixProposalSchema = z.object({
  work: CiteWorkSchema,
  changes: z.array(z.string().max(100)).max(100),
  uncertainFields: z.array(z.string().max(100)).max(100),
  grounding: z
    .array(
      z.object({
        field: identifierFieldSchema,
        status: z.enum(['verified', 'unverified', 'not_checked']),
      })
    )
    .max(4),
  needsReview: z.literal(true),
});
export type CitationFixProposal = z.infer<typeof citationFixProposalSchema>;
export const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
});
export type CitationAiUsage = z.infer<typeof usageSchema>;

export const bindingSchema = z.object({
  userId: z.uuid(),
  billingWsId: z.uuid(),
  feature: z.literal(CITE_AI_FEATURE),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CitationAiBinding = z.infer<typeof bindingSchema>;
export type CitationDurableChargeRead =
  | { kind: 'absent' }
  | { kind: 'charged'; bindingMatches: boolean }
  | { kind: 'unavailable' };
const checkpointSchema = z.object({
  binding: bindingSchema,
  modelId: z.string().min(1).max(256),
  usage: usageSchema,
  outcome: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('proposal'),
      proposal: citationFixProposalSchema,
    }),
    z.object({ kind: z.literal('invalid') }),
  ]),
});
export type CitationAiCheckpoint = z.infer<typeof checkpointSchema>;
export const citationAiOperationSchema = z.discriminatedUnion('stage', [
  z.object({ stage: z.literal('running'), binding: bindingSchema }),
  checkpointSchema.extend({ stage: z.literal('checkpoint') }),
  checkpointSchema.extend({ stage: z.literal('settling') }),
  checkpointSchema.extend({
    stage: z.literal('settled'),
    creditsDeducted: z.number().finite().nonnegative(),
  }),
  z.object({
    stage: z.literal('failed'),
    binding: bindingSchema,
    code: z.enum([
      'GENERATION_FAILED',
      'CANCELLED',
      'AI_UNAVAILABLE',
      'FEATURE_NOT_ALLOWED',
      'CREDITS_EXHAUSTED',
      'CREDIT_CHECK_FAILED',
      'BILLING_PENDING',
    ]),
  }),
]);
export type CitationAiOperation = z.infer<typeof citationAiOperationSchema>;

export class CitationAiError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_INPUT'
      | 'OPERATION_EXPIRED'
      | 'OPERATION_CONFLICT'
      | 'GENERATION_IN_PROGRESS'
      | 'BILLING_PENDING'
      | 'AI_UNAVAILABLE'
      | 'INVALID_AI_OUTPUT'
      | 'FEATURE_NOT_ALLOWED'
      | 'CREDITS_EXHAUSTED'
      | 'CREDIT_CHECK_FAILED'
      | 'GENERATION_FAILED'
      | 'CANCELLED',
    public readonly status: 400 | 403 | 409 | 413 | 499 | 502 | 503,
    public readonly billingStatus?: 'unknown' | 'settled'
  ) {
    super(code);
  }
}

export function validateCitationOperationTime(
  operationId: string,
  now: number
) {
  const timestamp = Number.parseInt(
    operationId.slice(0, 8) + operationId.slice(9, 13),
    16
  );
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp > now + CITE_AI_OPERATION_FUTURE_TOLERANCE_MS ||
    now - timestamp > CITE_AI_OPERATION_MAX_AGE_MS
  )
    throw new CitationAiError('OPERATION_EXPIRED', 409);
}

export interface CitationAiOperationStore {
  claim(
    operationId: string,
    binding: CitationAiBinding
  ): Promise<
    | { claimed: true; record: CitationAiOperation }
    | { claimed: false; record: CitationAiOperation }
  >;
  transition(
    operationId: string,
    previous: CitationAiOperation,
    next: CitationAiOperation,
    releaseActor?: boolean
  ): Promise<boolean>;
  read(
    operationId: string,
    userId: string
  ): Promise<CitationAiOperation | null>;
}
