import { flashcardSchema } from '@tuturuuu/ai/object/types';
import { contextObjectRequestSchema } from '../schemas';
import { createTeachObjectGenerationHandler } from '../shared';

export const POST = createTeachObjectGenerationHandler({
  buildPrompt: ({ context }) =>
    `Generate 10 flashcards with the following context (in the same language as the provided context): ${context}`,
  customIdPrefix: 'flashcards',
  outputSchema: flashcardSchema,
  requestSchema: contextObjectRequestSchema,
  source: 'flashcard_generation',
  surface: 'flashcard_generation',
});
