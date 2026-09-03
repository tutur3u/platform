import { z } from 'zod';

const MAX_CONTEXT_LENGTH = 20_000;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_OPTION_LENGTH = 4_000;

const nonEmptyString = z.string().trim().min(1);

export const contextObjectRequestSchema = z
  .object({
    context: nonEmptyString.max(MAX_CONTEXT_LENGTH),
    wsId: nonEmptyString.max(MAX_IDENTIFIER_LENGTH),
  })
  .strict();

export const quizExplanationRequestSchema = z
  .object({
    option: z
      .object({
        explanation: z.string().max(MAX_CONTEXT_LENGTH).optional().nullable(),
        id: z.string().max(MAX_IDENTIFIER_LENGTH).optional(),
        is_correct: z.boolean(),
        value: nonEmptyString.max(MAX_OPTION_LENGTH),
      })
      .strict(),
    question: nonEmptyString.max(MAX_CONTEXT_LENGTH),
    wsId: nonEmptyString.max(MAX_IDENTIFIER_LENGTH),
  })
  .strict();
