import { z } from 'zod';

export const flashcardSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string().describe('Question. Do not use emojis or links.'),
      back: z.string().describe('Answer. Do not use emojis or links.'),
    })
  ),
});

export const quizSchema = z.object({
  quizzes: z.array(
    z.object({
      question: z.string().describe('Question. Do not use emojis or links.'),
      quiz_options: z.array(
        z.object({
          value: z.string().describe('Option. Do not use emojis or links.'),
          is_correct: z.boolean().describe('Correct answer.'),
        })
      ),
    })
  ),
});
