import { describe, expect, it } from 'vitest';
import type { FormAnswerValue, FormDefinitionQuestion } from '../types';
import { findMissingRequiredQuestions, isAnswered } from './step-validation';

const emptyImage = { storagePath: '', url: '', alt: '' };

function question(id: string): FormDefinitionQuestion {
  return {
    id,
    sectionId: 'section-1',
    type: 'short_text',
    title: id,
    description: '',
    required: false,
    image: emptyImage,
    settings: {},
    options: [],
  };
}

describe('isAnswered', () => {
  it('treats a non-empty string as answered', () => {
    expect(isAnswered('yes')).toBe(true);
  });

  it('treats an empty string, null and undefined as unanswered', () => {
    expect(isAnswered('')).toBe(false);
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
  });

  it('treats an empty list as unanswered but a filled one as answered', () => {
    // A multi-select or ranking with nothing chosen is blank, not a value.
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(['a'])).toBe(true);
  });

  it('treats 0 as answered', () => {
    // NPS starts at 0, so a falsy check here would silently reject the lowest
    // possible score as if the respondent had skipped the question.
    expect(isAnswered(0 as unknown as FormAnswerValue)).toBe(true);
  });
});

describe('findMissingRequiredQuestions', () => {
  const questions = [question('q1'), question('q2'), question('q3')];
  const required = new Set(['q1', 'q3']);

  it('returns only required questions that are unanswered', () => {
    const missing = findMissingRequiredQuestions(questions, required, {
      q1: 'answered',
    });
    expect(missing.map((entry) => entry.id)).toEqual(['q3']);
  });

  it('ignores optional questions regardless of their answers', () => {
    const missing = findMissingRequiredQuestions(questions, required, {
      q1: 'a',
      q3: 'b',
    });
    expect(missing).toEqual([]);
  });

  it('preserves screen order, since the runtime reports and scrolls to the first', () => {
    const missing = findMissingRequiredQuestions(questions, required, {});
    expect(missing.map((entry) => entry.id)).toEqual(['q1', 'q3']);
  });
});
