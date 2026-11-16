import { describe, expect, it } from 'vitest';
import {
  CITE_WORK_TYPES,
  CiteWorkSchema,
  citeDateSchema,
  isValidIsbn,
} from './model';
import {
  citationFieldsSchema,
  fromLegacyCitationFields,
  toLegacyCitationFields,
} from './legacy';

const source = {
  id: 'synthetic',
  type: 'book',
  title: 'Synthetic maps',
} as const;

describe('portable citation model', () => {
  it('represents the 32 canonical categories with explicit provenance defaults', () => {
    expect(CITE_WORK_TYPES).toHaveLength(32);
    for (const type of CITE_WORK_TYPES)
      expect(CiteWorkSchema.parse({ ...source, type })).toMatchObject({
        type,
        provenance: {
          sourceCaptureMethod: 'manual',
          verificationStatus: 'manual',
        },
      });
  });
  it('validates contributor variants, genuine dates and safe source links', () => {
    expect(
      CiteWorkSchema.parse({
        ...source,
        authors: [{ kind: 'organization', name: 'Fictional Institute' }],
      }).authors
    ).toEqual([{ kind: 'organization', name: 'Fictional Institute' }]);
    for (const issued of [
      { year: 2025, month: 2, day: 29 },
      { year: 2024, day: 3 },
      { nd: true, year: 2024 },
    ])
      expect(citeDateSchema.safeParse(issued).success).toBe(false);
    expect(
      citeDateSchema.safeParse({ year: 2024, month: 2, day: 29 }).success
    ).toBe(true);
    expect(
      CiteWorkSchema.safeParse({ ...source, url: 'javascript:alert(1)' })
        .success
    ).toBe(false);
    expect(
      CiteWorkSchema.safeParse({ ...source, url: 'https://secret@example.org' })
        .success
    ).toBe(false);
  });
  it('normalizes identifiers and rejects invalid checksums and unbounded metadata', () => {
    expect(
      CiteWorkSchema.parse({
        ...source,
        doi: 'https://doi.org/10.5555/SYNTHETIC',
        isbn: '978-1-2345-6789-7',
      })
    ).toMatchObject({ doi: '10.5555/synthetic', isbn: '9781234567897' });
    expect(isValidIsbn('9781234567898')).toBe(false);
    expect(
      CiteWorkSchema.safeParse({ ...source, title: 'x'.repeat(2001) }).success
    ).toBe(false);
  });
  it('preserves the legacy contract without narrowing its source-type union', () => {
    const fields = citationFieldsSchema.parse({
      type: 'article-journal',
      title: 'Synthetic tides',
      authors: [{ family: 'Vale', given: 'Mira' }],
      year: 2024,
      DOI: '10.5555/synthetic',
    });
    const work = fromLegacyCitationFields(fields);
    expect(work.type).toBe('journal-article');
    expect(toLegacyCitationFields(work)).toMatchObject(fields);
    expect(fromLegacyCitationFields(fields).id).toBe(work.id);
    expect(
      fromLegacyCitationFields({ ...fields, title: 'Other tides' }).id
    ).not.toBe(work.id);
  });
  it('caps only the legacy projection of an organization name', () => {
    const work = CiteWorkSchema.parse({
      ...source,
      authors: [{ kind: 'organization', name: 'x'.repeat(500) }],
    });
    expect(
      citationFieldsSchema.parse(toLegacyCitationFields(work)).authors[0]
        ?.family
    ).toHaveLength(200);
    expect(work.authors[0]).toMatchObject({ name: 'x'.repeat(500) });
  });
});
