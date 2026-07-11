import { describe, expect, it } from 'vitest';
import { parseVocabularyUpdate } from './route';

function vocabularyEntry(id: string, imageUrl = '') {
  return {
    definition: 'A definition',
    examples: ['An example'],
    id,
    imageUrl,
    pronunciation: '',
    word: `word-${id}`,
  };
}

describe('parseVocabularyUpdate', () => {
  it('rejects duplicate vocabulary ids', () => {
    const result = parseVocabularyUpdate({
      vocabulary: [vocabularyEntry('duplicate'), vocabularyEntry('duplicate')],
    });

    expect(result).toEqual({
      errors: ['Vocabulary item 2 has a duplicate id.'],
      ok: false,
    });
  });

  it('rejects aggregate image data over 10MB', () => {
    const imagePayload = 'a'.repeat(5_000_001);
    const result = parseVocabularyUpdate({
      vocabulary: [
        vocabularyEntry('first', `data:image/png;base64,${imagePayload}`),
        vocabularyEntry('second', `data:image/png;base64,${imagePayload}`),
      ],
    });

    expect(result).toEqual({
      errors: ['Vocabulary images exceed the aggregate 10MB limit.'],
      ok: false,
    });
  });
});
