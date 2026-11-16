// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatCitation } from './format';
import { type CitationFields, citationFieldsSchema } from './types';

const fixtures = {
  url: {
    type: 'webpage',
    title: 'A field guide to fictional constellations',
    authors: [{ family: 'Orin', given: 'Lea' }],
    year: 2025,
    containerTitle: 'Imaginary Observatory',
    URL: 'https://example.org/constellations',
    accessed: '2026-11-16',
  },
  doi: {
    type: 'article-journal',
    title: 'Synthetic tides in miniature oceans',
    authors: [
      { family: 'Vale', given: 'Mira' },
      { family: 'Chen', given: 'Noel' },
    ],
    year: 2024,
    containerTitle: 'Journal of Invented Systems',
    volume: '12',
    issue: '3',
    pages: '41-49',
    DOI: '10.5555/synthetic.2024.41',
  },
  isbn: {
    type: 'book',
    title: 'Maps of invented rivers',
    authors: [{ family: 'Vale', given: 'Mira' }],
    year: 2024,
    publisher: 'Lantern Press',
    publisherPlace: 'Example City',
    ISBN: '9780000000002',
  },
  manual: {
    type: 'book',
    title: 'The quiet geometry of clouds',
    authors: [{ family: 'Ash', given: 'Tari' }],
    year: 2023,
    publisher: 'Paper Moon',
  },
} satisfies Record<string, CitationFields>;

describe('official CSL citation formatting with synthetic sources', () => {
  it('formats URL metadata in APA 7', () => {
    expect(formatCitation(fixtures.url, 'apa')).toEqual({
      reference:
        'Orin, L. (2025). A field guide to fictional constellations. Imaginary Observatory. https://example.org/constellations',
      inText: '(Orin, 2025)',
    });
  });

  it('formats URL metadata in RMIT Harvard', () => {
    expect(formatCitation(fixtures.url, 'harvard')).toEqual({
      reference:
        'Orin L (2025) A field guide to fictional constellations, Imaginary Observatory, accessed 16 November 2026. https://example.org/constellations',
      inText: '(Orin 2025)',
    });
  });

  it('formats DOI metadata in APA 7', () => {
    expect(formatCitation(fixtures.doi, 'apa')).toEqual({
      reference:
        'Vale, M., & Chen, N. (2024). Synthetic tides in miniature oceans. Journal of Invented Systems, 12(3), 41–49. https://doi.org/10.5555/synthetic.2024.41',
      inText: '(Vale & Chen, 2024)',
    });
  });

  it('formats DOI metadata in RMIT Harvard', () => {
    expect(formatCitation(fixtures.doi, 'harvard')).toEqual({
      reference:
        'Vale M & Chen N (2024) Synthetic tides in miniature oceans, Journal of Invented Systems, vol. 12, no. 3, pp. 41–49',
      inText: '(Vale & Chen 2024)',
    });
  });

  it('formats ISBN metadata in APA 7', () => {
    expect(formatCitation(fixtures.isbn, 'apa')).toEqual({
      reference: 'Vale, M. (2024). Maps of invented rivers. Lantern Press.',
      inText: '(Vale, 2024)',
    });
  });

  it('formats ISBN metadata in RMIT Harvard', () => {
    expect(formatCitation(fixtures.isbn, 'harvard')).toEqual({
      reference:
        'Vale M (2024) Maps of invented rivers, Lantern Press, Example City',
      inText: '(Vale 2024)',
    });
  });

  it('formats manual fields in APA 7', () => {
    expect(formatCitation(fixtures.manual, 'apa')).toEqual({
      reference: 'Ash, T. (2023). The quiet geometry of clouds. Paper Moon.',
      inText: '(Ash, 2023)',
    });
  });

  it('formats manual fields in RMIT Harvard', () => {
    expect(formatCitation(fixtures.manual, 'harvard')).toEqual({
      reference: 'Ash T (2023) The quiet geometry of clouds, Paper Moon',
      inText: '(Ash 2023)',
    });
  });

  it('uses style-defined title and no-date fallbacks without inventing metadata', () => {
    expect(
      formatCitation(
        { type: 'webpage', title: 'Untitled fictional archive', authors: [] },
        'apa'
      )
    ).toEqual({
      reference: 'Untitled fictional archive. (n.d.).',
      inText: '(Untitled Fictional Archive, n.d.)',
    });
  });

  it('keeps repeated independent formatting free of document state', () => {
    const first = formatCitation(fixtures.url, 'apa');
    formatCitation(fixtures.manual, 'harvard');
    expect(formatCitation(fixtures.url, 'apa')).toEqual(first);
  });

  it('returns plain text without generated rich-text wrappers', () => {
    const result = formatCitation(fixtures.doi, 'apa');
    expect(result.reference).not.toMatch(/<\/?(?:i|a|div|span)\b/);
  });

  it('rejects malformed or unbounded fields at the formatter boundary', () => {
    expect(
      citationFieldsSchema.safeParse({
        ...fixtures.url,
        accessed: '2026-02-30',
      }).success
    ).toBe(false);
    expect(() =>
      formatCitation({ ...fixtures.manual, title: ' ' }, 'apa')
    ).toThrow();
    expect(() =>
      formatCitation({ ...fixtures.manual, title: 'a'.repeat(2001) }, 'apa')
    ).toThrow();
  });
});
