import { CiteWorkSchema } from '@tuturuuu/cite';
import { describe, expect, it } from 'vitest';
import { groupCitationWorks } from './document-citation-groups';

const work = (id: string, fields: object = {}) =>
  CiteWorkSchema.parse({
    id,
    type: 'book',
    title: 'Synthetic field notes',
    authors: [{ kind: 'person', family: 'Nguyen' }],
    ...fields,
  });

describe('document source grouping', () => {
  it('merges matching secondary identifiers in either order', () => {
    const full = work('a', { doi: '10.1234/synthetic', isbn: '9780306406157' });
    const isbnOnly = work('b', { isbn: '0306406152' });
    expect(groupCitationWorks([full, isbnOnly])).toEqual([0, 0]);
    expect(groupCitationWorks([isbnOnly, full])).toEqual([0, 0]);
  });

  it('merges two existing groups when a later source bridges identifiers', () => {
    expect(
      groupCitationWorks([
        work('a', { doi: '10.1234/synthetic' }),
        work('b', { isbn: '9780306406157' }),
        work('c', { doi: '10.1234/synthetic', isbn: '9780306406157' }),
      ])
    ).toEqual([0, 0, 0]);
  });

  it('keeps different editions separate without shared identifiers', () => {
    expect(
      groupCitationWorks([
        work('a', { edition: '1' }),
        work('b', { edition: '2' }),
        work('c', { edition: '1' }),
      ])
    ).toEqual([0, 1, 0]);
  });

  it('keeps chapters and conference papers separate when their container ISBN agrees', () => {
    for (const type of ['book-chapter', 'conference-paper'] as const) {
      const a = work('a', {
        type,
        isbn: '9780306406157',
        title: 'First synthetic chapter',
        pages: '1-10',
      });
      const b = work('b', {
        type,
        isbn: '9780306406157',
        title: 'Second synthetic chapter',
        pages: '11-20',
      });
      expect(groupCitationWorks([a, b])).toEqual([0, 1]);
      expect(
        groupCitationWorks([
          { ...a, doi: '10.1234/chapter-a' },
          { ...b, doi: '10.1234/chapter-b' },
        ])
      ).toEqual([0, 1]);
      expect(
        groupCitationWorks([
          a,
          { ...a, id: 'same-title-different-pages', pages: '11-20' },
        ])
      ).toEqual([0, 1]);
    }
  });

  it('leaves every ISBN bridge record separate when the ISBN identifies contradictory DOIs', () => {
    const a = work('a', { doi: '10.1234/a', isbn: '9780306406157' });
    const b = work('b', { isbn: '9780306406157' });
    const c = work('c', { doi: '10.1234/c', isbn: '9780306406157' });
    for (const items of [
      [a, b, c],
      [c, b, a],
      [b, a, c],
    ])
      expect(groupCitationWorks(items)).toEqual([0, 1, 2]);
  });

  it('checks whole groups before a different secondary key joins them', () => {
    const a = work('a', { doi: '10.1234/a', pmid: '12345' });
    const b = work('b', { doi: '10.1234/a', isbn: '9780306406157' });
    const c = work('c', { pmid: '67890', isbn: '9780306406157' });
    expect(groupCitationWorks([a, b, c])).toEqual([0, 0, 2]);
    expect(groupCitationWorks([c, b, a])).toEqual([0, 1, 1]);
  });

  it.each([
    [{ pmid: '12345' }, { pmid: '67890' }],
    [{ arxivId: '2401.00001v1' }, { arxivId: '2401.00002v1' }],
  ])(
    'does not merge conflicting registry identities through an agreeing DOI',
    (left, right) => {
      expect(
        groupCitationWorks([
          work('a', { doi: '10.1234/shared', ...left }),
          work('b', { doi: '10.1234/shared', ...right }),
        ])
      ).toEqual([0, 1]);
    }
  );

  it('requires compatible types and normalized titles for URL-only overlap', () => {
    const a = work('a', {
      url: 'https://example.org/source?utm_source=fixture',
    });
    const normalizedTitle = work('b', {
      url: 'https://example.org/source',
      title: 'SYNTHETIC field notes.',
    });
    expect(groupCitationWorks([a, normalizedTitle])).toEqual([0, 0]);
    expect(
      groupCitationWorks([a, { ...normalizedTitle, type: 'webpage' }])
    ).toEqual([0, 1]);
    expect(
      groupCitationWorks([
        a,
        { ...normalizedTitle, title: 'Different synthetic source' },
      ])
    ).toEqual([0, 1]);
  });
});
