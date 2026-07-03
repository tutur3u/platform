import { z } from 'zod';

// Schema for email draft generation
export const emailDraftSchema = z.object({
  subject: z.string().describe('A professional and concise email subject line'),
  content: z
    .string()
    .describe(
      'The main body of the email in plain text format. DO NOT INCLUDE THE EMAIL SUBJECT HERE.'
    ),
  tone: z
    .enum(['formal', 'casual', 'friendly', 'professional'])
    .describe('The tone of the email'),
  suggestions: z
    .array(z.string())
    .describe('Additional suggestions for improving the email'),
});

export type EmailDraft = z.infer<typeof emailDraftSchema>;
