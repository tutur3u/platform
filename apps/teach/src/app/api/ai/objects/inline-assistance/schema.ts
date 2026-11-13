import { z } from 'zod';

export const inlineAssistanceRequestSchema = z.object({
  wsId: z.string().min(1).max(100),
  courseId: z.uuid(),
  moduleId: z.uuid(),
  text: z
    .string()
    .min(1)
    .max(12_000)
    .refine((text) => text.trim().length > 0),
  subject: z.enum([
    'writing',
    'math',
    'physics',
    'chemistry',
    'biology',
    'general',
  ]),
  locale: z.enum(['en', 'vi']),
  // This route requires teacher update permissions. This choice applies only to
  // the authenticated teacher's authoring review, never to learner assessments.
  level: z.enum(['hints', 'full']),
});
