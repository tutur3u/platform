import { describe, expect, it } from 'vitest';
import { CiteWorkSchema } from './model';
import { validateCitation } from './validation';

describe('style and source validation', () => {
  it('requires Harvard place only when a book has no DOI', () => {
    const book = CiteWorkSchema.parse({
      id: 'book',
      type: 'book',
      title: 'Synthetic maps',
      publisher: 'Fictional Press',
    });
    expect(validateCitation(book, 'harvard')).toContainEqual(
      expect.objectContaining({ field: 'publisherPlace', severity: 'error' })
    );
    expect(
      validateCitation({ ...book, doi: '10.5555/book' }, 'harvard').filter(
        ({ severity }) => severity === 'error'
      )
    ).toEqual([]);
    expect(
      validateCitation(book, 'apa').filter(
        ({ severity }) => severity === 'error'
      )
    ).toEqual([]);
  });
  it('reports missing source requirements and reviewable attribution', () => {
    const source = CiteWorkSchema.parse({
      id: 'web',
      type: 'webpage',
      title: 'Synthetic',
      provenance: {
        sourceCaptureMethod: 'ai_parsed',
        verificationStatus: 'ai_inferred',
      },
    });
    expect(
      validateCitation(source, 'harvard').map(({ field }) => field)
    ).toEqual(expect.arrayContaining(['url', 'accessed', 'provenance']));
    const indigenous = CiteWorkSchema.parse({
      id: 'knowledge',
      type: 'indigenous-knowledge',
      title: 'Synthetic community knowledge',
    });
    expect(validateCitation(indigenous, 'apa')).toContainEqual(
      expect.objectContaining({ code: 'protocol-review', severity: 'warning' })
    );
  });
});
