import { z } from 'zod';
export const voiceArtifactSchema = z.object({
  title: z.string().max(1000),
  summary: z.string(),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      dueDate: z.string().nullable(),
      evidence: z.string(),
    })
  ),
  recommendations: z.array(
    z.object({ suggestion: z.string(), evidence: z.string() })
  ),
  openQuestions: z.array(z.string()),
});
export const voiceRequestSchema = z.object({
  requestId: z.uuid(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  expectedRevision: z.coerce.number().int().positive().optional(),
});
export type VoiceArtifact = z.infer<typeof voiceArtifactSchema>;
export class NotesVoiceError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}
