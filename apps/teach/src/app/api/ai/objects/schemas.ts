import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

export const contextObjectRequestSchema = z
  .object({
    context: nonEmptyString,
    wsId: nonEmptyString,
  })
  .strict();

export const quizExplanationRequestSchema = z
  .object({
    option: z
      .object({
        explanation: z.string().optional().nullable(),
        id: z.string().optional(),
        is_correct: z.boolean(),
        value: nonEmptyString,
      })
      .strict(),
    question: nonEmptyString,
    wsId: nonEmptyString,
  })
  .strict();
