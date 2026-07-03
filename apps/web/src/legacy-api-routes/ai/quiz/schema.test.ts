import { describe, expect, it } from 'vitest';
import { GeneratedQuizSchema } from './schema';

describe('GeneratedQuizSchema', () => {
  it('requires type-specific fields', () => {
    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Which option is correct?',
        score: 1,
        type: 'multiple_choice',
        options: null,
        correct_option_index: null,
        correct_boolean: null,
        matching_pairs: null,
        ordering_items: null,
      }).success
    ).toBe(false);

    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Is this true?',
        score: 1,
        type: 'true_false',
        options: null,
        correct_option_index: null,
        correct_boolean: null,
        matching_pairs: null,
        ordering_items: null,
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
        correct_boolean: null,
        matching_pairs: null,
        ordering_items: null,
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
        correct_boolean: null,
        matching_pairs: null,
        ordering_items: null,
      }).success
    ).toBe(true);

    expect(
      GeneratedQuizSchema.safeParse({
        question: 'Put these in order.',
        score: 1,
        type: 'ordering',
        options: null,
        correct_option_index: null,
        correct_boolean: null,
        matching_pairs: null,
        ordering_items: ['First', 'Second'],
      }).success
    ).toBe(true);
  });
});
