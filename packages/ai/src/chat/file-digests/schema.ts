import { z } from 'zod';

export const chatFileDigestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4_000),
  answerContextMarkdown: z.string().trim().min(1).max(12_000),
  extractedMarkdown: z.string().trim().max(80_000).nullable().optional(),
  keyFacts: z.array(z.string().trim().min(1).max(500)).max(12),
  suggestedAlias: z.string().trim().min(1).max(255).nullable(),
  limitations: z.array(z.string().trim().min(1).max(500)).max(12),
});

export type ChatFileDigestSchemaOutput = z.infer<typeof chatFileDigestSchema>;
