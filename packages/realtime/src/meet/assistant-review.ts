import { z } from 'zod';

export const assistantReviewSchema = z.object({
  text: z.string().max(16000),
  continuation: z.string().max(200000),
  approvals: z
    .array(
      z.object({
        id: z.string().max(200),
        toolName: z.string().max(100),
        input: z.unknown(),
      })
    )
    .max(16),
  workspaceId: z.uuid(),
  workspaceName: z.string().max(200),
  timezone: z.string().max(100),
});
export type AssistantReview = z.infer<typeof assistantReviewSchema> & {
  status: 'ready' | 'executing' | 'shared' | 'discarded';
  revision: number;
};
export const assistantReviewCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ai.review.get'),
    messageId: z.string().max(200),
  }),
  z.object({
    action: z.literal('ai.review.save'),
    messageId: z.string().max(200),
    review: assistantReviewSchema,
    costUsd: z.number().nonnegative().nullable(),
  }),
  z.object({
    action: z.literal('ai.review.claim'),
    messageId: z.string().max(200),
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal('ai.review.share'),
    messageId: z.string().max(200),
    revision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal('ai.review.discard'),
    messageId: z.string().max(200),
    revision: z.number().int().nonnegative(),
  }),
]);
