import { describe, expect, it } from 'vitest';
import { isAutoAdvanceType, shouldAutoAdvance } from './auto-advance';

const base = { enabled: true, answerableCount: 1, value: 'a' } as const;

describe('isAutoAdvanceType', () => {
  it('includes the types that are complete in one gesture', () => {
    for (const type of [
      'single_choice',
      'dropdown',
      'linear_scale',
      'rating',
      'nps',
    ] as const) {
      expect(isAutoAdvanceType(type)).toBe(true);
    }
  });

  it('excludes types the respondent may still be composing', () => {
    // Advancing out of a half-typed answer or a partly-built ranking is worse
    // than the click auto-advance removes.
    for (const type of [
      'short_text',
      'long_text',
      'email',
      'number',
      'multiple_choice',
      'ranking',
      'date',
    ] as const) {
      expect(isAutoAdvanceType(type)).toBe(false);
    }
  });
});

describe('shouldAutoAdvance', () => {
  it('advances on a single-gesture answer', () => {
    expect(shouldAutoAdvance({ ...base, type: 'single_choice' })).toBe(true);
    expect(shouldAutoAdvance({ ...base, type: 'nps', value: '0' })).toBe(true);
  });

  it('never advances when the author turned it off', () => {
    expect(
      shouldAutoAdvance({ ...base, enabled: false, type: 'single_choice' })
    ).toBe(false);
  });

  it('never advances when the screen holds more than one question', () => {
    // The second question would be skipped unanswered.
    expect(
      shouldAutoAdvance({ ...base, answerableCount: 2, type: 'single_choice' })
    ).toBe(false);
  });

  it('never advances on a cleared answer', () => {
    // Deselecting is a correction; moving on would take it away.
    expect(
      shouldAutoAdvance({ ...base, type: 'single_choice', value: '' })
    ).toBe(false);
    expect(
      shouldAutoAdvance({ ...base, type: 'single_choice', value: null })
    ).toBe(false);
  });

  it('never advances on a list answer', () => {
    expect(
      shouldAutoAdvance({ ...base, type: 'multiple_choice', value: ['a'] })
    ).toBe(false);
  });
});
