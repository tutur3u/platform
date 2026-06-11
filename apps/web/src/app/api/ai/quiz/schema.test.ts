import { describe, expect, it } from 'vitest';
import { GeneratedQuizSchema } from './schema';

describe('GeneratedQuizSchema', () => {
  it('requires type-specific fields', () => {
    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Which option is correct?',
        score: 1,
        type: 'multiple_choice',
      }).success
    ).toBe(false);

    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Is this true?',
        score: 1,
        type: 'true_false',
      }).success
    ).toBe(false);
  });

  it('rejects multiple-choice answers outside the options array', () => {
    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Which option is correct?',
        score: 1,
        type: 'multiple_choice',
        options: ['A', 'B'],
        correct_option_index: 2,
      }).success
    ).toBe(false);
  });

  it('accepts valid generated quiz variants', () => {
    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Which option is correct?',
        score: 1,
        type: 'multiple_choice',
        options: ['A', 'B'],
        correct_option_index: 1,
      }).success
    ).toBe(true);

    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Put these in order.',
        score: 1,
        type: 'ordering',
        ordering_items: ['First', 'Second'],
      }).success
    ).toBe(true);
  });
});
