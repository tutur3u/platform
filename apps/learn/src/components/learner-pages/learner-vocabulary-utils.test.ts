import { describe, expect, it } from 'vitest';
import {
  buildQuizOptions,
  type VocabularyEntry,
} from './learner-vocabulary-utils';

function entry(id: string, word: string): VocabularyEntry {
  return {
    definition: `${word} definition`,
    examples: [],
    id,
    imageUrl: '',
    pronunciation: '',
    word,
  };
}

describe('buildQuizOptions', () => {
  it('does not include duplicate answer labels', () => {
    const options = buildQuizOptions(0, [
      entry('first', 'bank'),
      entry('second', 'bank'),
      entry('third', 'river'),
    ]);

    expect(options).toHaveLength(2);
    expect(new Set(options).size).toBe(options.length);
    expect(options).toContain('bank');
    expect(options).toContain('river');
  });
});
