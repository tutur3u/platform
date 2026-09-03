import { describe, expect, it } from 'vitest';
import { quizExplanationRequestSchema } from '../../schemas';

describe('quiz explanation object request', () => {
  it('accepts the current quiz-form payload including persisted option fields', () => {
    expect(
      quizExplanationRequestSchema.parse({
        option: {
          explanation: '',
          id: 'option-1',
          is_correct: true,
          value: 'Chlorophyll',
        },
        question: 'Which pigment absorbs light?',
        wsId: 'workspace-1',
      })
    ).toEqual({
      option: {
        explanation: '',
        id: 'option-1',
        is_correct: true,
        value: 'Chlorophyll',
      },
      question: 'Which pigment absorbs light?',
      wsId: 'workspace-1',
    });
  });
});
