import { quizSchema } from '@tuturuuu/ai/object/types';
import { contextObjectRequestSchema } from '../schemas';
import { createTeachObjectGenerationHandler } from '../shared';

export const POST = createTeachObjectGenerationHandler({
  buildPrompt: ({ context }) =>
    `Generate 10 quizzes with the following context (in the same language as the provided context): ${context}`,
  customIdPrefix: 'quiz',
  outputSchema: quizSchema,
  requestSchema: contextObjectRequestSchema,
  source: 'quiz_generation',
  surface: 'quiz_generation',
});
