import { describe, expect, it } from 'vitest';
import { CiteWorkSchema } from './model';
import {
  canonicalizeSourceUrl,
  citationSimilarity,
  deduplicateLibrary,
  fingerprintWork,
  hardMatchKeys,
  ambiguousCitationIdentityKeys,
  citationIdentityGroupIsCompatible,
} from './dedup';

const work = CiteWorkSchema.parse({
  id: 'a',
  type: 'journal-article',
  title: 'Synthetic currents in miniature oceans',
  authors: [{ kind: 'person', family: 'Vale', given: 'Mira' }],
  issued: { year: 2024 },
  doi: '10.5555/synthetic',
});
describe('citation library deduplication', () => {
  it('normalizes hard identifiers and prefers verified metadata without merging', async () => {
    const verified = CiteWorkSchema.parse({
      ...work,
      id: 'b',
      doi: 'HTTPS://DOI.ORG/10.5555/SYNTHETIC',
      provenance: {
        sourceCaptureMethod: 'doi',
        verificationStatus: 'verified_registry',
      },
    });
    expect(await fingerprintWork(work)).toBe(await fingerprintWork(verified));
    expect(deduplicateLibrary([work, verified])).toMatchObject([
      {
        leftId: 'a',
        rightId: 'b',
        kind: 'hard',
        score: 1,
        preferredId: 'b',
        differingFields: ['provenance'],
      },
    ]);
    expect(work.id).toBe('a');
  });
  it('compares ISBN10 and ISBN13 and canonical source URLs', () => {
    const a = CiteWorkSchema.parse({
      ...work,
      id: 'book-a',
      doi: undefined,
      type: 'book',
      isbn: '123456789X',
    });
    const b = CiteWorkSchema.parse({
      ...a,
      id: 'book-b',
      isbn: '9781234567897',
    });
    expect(deduplicateLibrary([a, b])[0]?.kind).toBe('hard');
    expect(
      canonicalizeSourceUrl(
        'https://example.org/item?utm_source=test&b=2&a=1#part'
      )
    ).toBe('https://example.org/item?a=1&b=2');
  });
  it('returns soft review candidates and avoids conflicting DOI merges', () => {
    const a = CiteWorkSchema.parse({ ...work, doi: undefined });
    const b = CiteWorkSchema.parse({
      ...a,
      id: 'b',
      title: 'Synthetic currents in miniature oceans.',
    });
    expect(citationSimilarity(a, b)).toBe(1);
    expect(deduplicateLibrary([a, b])[0]?.kind).toBe('soft');
    expect(
      citationSimilarity(
        work,
        CiteWorkSchema.parse({ ...work, id: 'other', doi: '10.5555/different' })
      )
    ).toBe(0);
  });
  it('keeps different editions as review candidates with distinct stored fingerprints', async () => {
    const a = CiteWorkSchema.parse({
      ...work,
      doi: undefined,
      type: 'book',
      edition: '1',
    });
    const b = CiteWorkSchema.parse({ ...a, id: 'b', edition: '2' });
    expect(deduplicateLibrary([a, b])[0]?.kind).toBe('soft');
    expect(await fingerprintWork(a)).not.toBe(await fingerprintWork(b));
    expect(() =>
      deduplicateLibrary(Array.from({ length: 1001 }, () => a))
    ).toThrow(RangeError);
  });

  it('treats an ISBN as container metadata for chapters and conference papers', async () => {
    for (const type of ['book-chapter', 'conference-paper'] as const) {
      const a = CiteWorkSchema.parse({
        ...work,
        id: 'chapter-a',
        type,
        doi: undefined,
        isbn: '9781234567897',
        pages: '1-10',
      });
      const b = CiteWorkSchema.parse({ ...a, id: 'chapter-b', pages: '11-20' });
      expect(hardMatchKeys(a)).not.toContain('isbn:9781234567897');
      expect(await fingerprintWork(a)).not.toBe(await fingerprintWork(b));
      expect(deduplicateLibrary([a, b])).toMatchObject([{ kind: 'soft' }]);
      const withDoi = CiteWorkSchema.parse({ ...a, doi: '10.5555/chapter-a' });
      const differentDoi = CiteWorkSchema.parse({
        ...b,
        doi: '10.5555/chapter-b',
      });
      expect(deduplicateLibrary([withDoi, differentDoi])).toEqual([]);
    }
  });

  it('does not turn an ambiguous ISBN bridge between different DOIs into hard matches', () => {
    const a = CiteWorkSchema.parse({
      ...work,
      type: 'book',
      isbn: '9781234567897',
    });
    const b = CiteWorkSchema.parse({ ...a, id: 'isbn-only', doi: undefined });
    const c = CiteWorkSchema.parse({
      ...a,
      id: 'different-doi',
      doi: '10.5555/different',
    });
    expect(ambiguousCitationIdentityKeys([a, b, c])).toContain(
      'isbn:9781234567897'
    );
    expect(citationIdentityGroupIsCompatible([a, b, c])).toBe(false);
    const candidates = deduplicateLibrary([a, b, c]);
    expect(candidates).toHaveLength(2);
    expect(candidates.every(({ kind }) => kind === 'soft')).toBe(true);
    expect(deduplicateLibrary([a, b])).toMatchObject([{ kind: 'hard' }]);
  });

  it.each([
    [{ pmid: '12345' }, { pmid: '67890' }],
    [{ arxivId: '2401.00001v1' }, { arxivId: '2401.00002v1' }],
  ])(
    'vetoes conflicting registry IDs even when another strong identifier agrees',
    (left, right) => {
      const a = CiteWorkSchema.parse({ ...work, ...left });
      const b = CiteWorkSchema.parse({ ...work, id: 'b', ...right });
      expect(deduplicateLibrary([a, b])).toEqual([]);
      expect(citationSimilarity(a, b)).toBe(0);
      expect(citationIdentityGroupIsCompatible([a, b])).toBe(false);
    }
  );

  it('normalizes arXiv versions and matches compatible ISBN-only book records', () => {
    const a = CiteWorkSchema.parse({ ...work, arxivId: '2401.00001v1' });
    const b = CiteWorkSchema.parse({ ...a, id: 'b', arxivId: '2401.00001v2' });
    expect(deduplicateLibrary([a, b])).toMatchObject([{ kind: 'hard' }]);
    const book = CiteWorkSchema.parse({
      ...work,
      type: 'book',
      isbn: '9781234567897',
    });
    const isbnOnly = CiteWorkSchema.parse({
      ...book,
      id: 'isbn-only',
      doi: undefined,
    });
    expect(deduplicateLibrary([book, isbnOnly])).toMatchObject([
      { kind: 'hard' },
    ]);
  });

  it('requires the same type and normalized title for URL-only hard identity', async () => {
    const a = CiteWorkSchema.parse({
      ...work,
      doi: undefined,
      url: 'https://example.org/source?utm_source=fixture',
    });
    const b = CiteWorkSchema.parse({
      ...a,
      id: 'b',
      url: 'https://example.org/source',
      title: `${a.title}.`,
    });
    expect(deduplicateLibrary([a, b])).toMatchObject([{ kind: 'hard' }]);
    expect(await fingerprintWork(a)).toBe(await fingerprintWork(b));
    const otherType = CiteWorkSchema.parse({ ...b, type: 'report' });
    const otherTitle = CiteWorkSchema.parse({
      ...b,
      title: 'Different synthetic source',
    });
    expect(deduplicateLibrary([a, otherType])).toMatchObject([
      { kind: 'soft' },
    ]);
    expect(
      deduplicateLibrary([a, otherTitle]).some(({ kind }) => kind === 'hard')
    ).toBe(false);
    expect(await fingerprintWork(a)).not.toBe(await fingerprintWork(otherType));
    expect(await fingerprintWork(a)).not.toBe(
      await fingerprintWork(otherTitle)
    );
  });
});
