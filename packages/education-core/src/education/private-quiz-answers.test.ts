import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it } from 'vitest';
import { attachPrivateWorkspaceQuizAnswers } from './private-quiz-answers';

function createPrivateAnswerDb(
  data: Array<{ answer: unknown; quiz_id: string }>
) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          in: async () => ({ data, error: null }),
        }),
      }),
    }),
  } as unknown as TypedSupabaseClient;
}

describe('attachPrivateWorkspaceQuizAnswers', () => {
  it('preserves fallback answers when no private answer row exists', async () => {
    const quizzes = [
      {
        id: 'legacy-answer',
        answer: { correct: true },
      },
      {
        id: 'private-answer',
        answer: { correct: false },
      },
      {
        id: 'private-null-answer',
        answer: { correct: false },
      },
      {
        id: 'missing-answer',
      },
    ];

    const result = await attachPrivateWorkspaceQuizAnswers(
      createPrivateAnswerDb([
        { quiz_id: 'private-answer', answer: { correct: true } },
        { quiz_id: 'private-null-answer', answer: null },
      ]),
      quizzes
    );

    expect(result).toEqual([
      {
        id: 'legacy-answer',
        answer: { correct: true },
      },
      {
        id: 'private-answer',
        answer: { correct: true },
      },
      {
        id: 'private-null-answer',
        answer: null,
      },
      {
        id: 'missing-answer',
        answer: null,
      },
    ]);
  });
});
