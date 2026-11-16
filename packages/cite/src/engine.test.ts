import { describe, expect, it } from 'vitest';
import { CiteWorkSchema, type CiteWork } from './model';
import { formatDocument, formatWork } from './engine';
import { toHtml, toPlainText } from './output';
import { toBibTeX, toRIS } from './export';

const author = { kind: 'person', family: 'Vale', given: 'Mira' } as const;
const book = CiteWorkSchema.parse({
  id: 'book',
  type: 'book',
  title: 'Maps of invented rivers',
  authors: [author],
  issued: { year: 2024 },
  publisher: 'Lantern Press',
  publisherPlace: 'Example City',
});
const article = CiteWorkSchema.parse({
  id: 'article',
  type: 'journal-article',
  title: 'Synthetic tides in miniature oceans',
  authors: [author, { kind: 'person', family: 'Chen', given: 'Noel' }],
  issued: { year: 2024 },
  containerTitle: 'Journal of Invented Systems',
  volume: '12',
  issue: '3',
  pages: '41-49',
  doi: '10.5555/synthetic.2024.41',
});
const webpage = CiteWorkSchema.parse({
  id: 'webpage',
  type: 'webpage',
  title: 'Fictional constellations',
  authors: [{ kind: 'organization', name: 'Imaginary Observatory' }],
  issued: { year: 2025 },
  containerTitle: 'Imaginary Observatory',
  accessed: '2026-11-16',
  url: 'https://example.org/constellations',
});

describe('CSL-backed Phase 1 citation output', () => {
  it('formats a synthetic APA book as rich text with the established plain form', () => {
    const result = formatWork(book, 'apa');
    expect(toPlainText(result.reference)).toBe(
      'Vale, M. (2024). Maps of invented rivers. Lantern Press.'
    );
    expect(toPlainText(result.inText)).toBe('(Vale, 2024)');
    expect(toHtml(result.reference)).toContain(
      '<em>Maps of invented rivers</em>'
    );
  });

  it('uses Harvard text conjunctions, single article quotes and colon locators', () => {
    const result = formatWork(article, 'harvard', { locator: '45' });
    expect(toPlainText(result.inText)).toBe('(Vale and Chen 2024:45)');
    const reference = toPlainText(result.reference);
    expect(reference).toContain('Vale M and Chen N (2024)');
    expect(reference).toContain("'Synthetic tides in miniature oceans'");
    expect(reference).toContain('doi:10.5555/synthetic.2024.41');
    expect(toHtml(result.reference)).toContain(
      '<em>Journal of Invented Systems</em>'
    );
  });

  it('uses et al. for three in-text authors while keeping all bibliography authors', () => {
    const work = {
      ...article,
      authors: [
        ...article.authors,
        { kind: 'person', family: 'Ash', given: 'Tari' } as const,
      ],
    };
    expect(toPlainText(formatWork(work, 'harvard').inText)).toBe(
      '(Vale et al. 2024)'
    );
    const reference = toPlainText(formatWork(work, 'harvard').reference);
    for (const surname of ['Vale M', 'Chen N', 'Ash T'])
      expect(reference).toContain(surname);
  });

  it('renders book DOI instead of place and preserves website/accessed metadata', () => {
    const doiBook = formatWork(
      { ...book, doi: '10.5555/synthetic.book' },
      'harvard'
    );
    expect(toPlainText(doiBook.reference)).toContain(
      'doi:10.5555/synthetic.book'
    );
    expect(toPlainText(doiBook.reference)).not.toContain('Example City');
    const web = toPlainText(formatWork(webpage, 'harvard').reference);
    expect(web).toContain('Imaginary Observatory website');
    expect(web).toContain('accessed 16 November 2026');
    expect(web).toContain('https://example.org/constellations');
  });

  it('keeps no-author/no-date sources and model/community attribution explicit', () => {
    const anonymous = CiteWorkSchema.parse({
      id: 'anonymous',
      type: 'webpage',
      title: 'Anonymous synthetic source',
      issued: { nd: true },
      url: 'https://example.org/anonymous',
      accessed: '2026-11-16',
    });
    expect(toPlainText(formatWork(anonymous, 'apa').inText)).toContain('n.d.');
    const ai = CiteWorkSchema.parse({
      ...anonymous,
      id: 'model',
      type: 'ai-generated',
      aiGenerated: {
        modelName: 'Imaginary Model',
        provider: 'Fictional Lab',
        modelVersion: '1',
      },
    });
    const output = toPlainText(formatWork(ai, 'harvard').reference);
    expect(output).toContain('Imaginary Model');
    expect(output).toContain('Fictional Lab');
    const community = CiteWorkSchema.parse({
      ...book,
      id: 'community',
      publisher: undefined,
      type: 'indigenous-knowledge',
      indigenous: {
        nationOrCommunity: 'Fictional Community',
        protocolNote: 'Synthetic fixture; permission must be checked',
      },
    });
    expect(toPlainText(formatWork(community, 'harvard').reference)).toContain(
      'Fictional Community'
    );
  });

  it.each(['apa', 'harvard'] as const)(
    'formats all Phase 1 families in %s without losing their title',
    (style) => {
      const sources: CiteWork[] = [
        book,
        article,
        webpage,
        CiteWorkSchema.parse({
          ...book,
          id: 'chapter',
          type: 'book-chapter',
          title: 'A synthetic chapter',
          containerTitle: 'Invented collections',
        }),
        CiteWorkSchema.parse({
          ...article,
          id: 'news',
          type: 'newspaper-article',
          title: 'Imaginary tides reported',
          containerTitle: 'Fictional Times',
        }),
        CiteWorkSchema.parse({
          ...book,
          id: 'report',
          type: 'report',
          title: 'Synthetic annual report',
          reportNumber: 'R-1',
        }),
        CiteWorkSchema.parse({
          ...book,
          id: 'dataset',
          type: 'dataset',
          title: 'Invented ocean measurements',
          medium: 'data set',
        }),
        CiteWorkSchema.parse({
          ...webpage,
          id: 'ai',
          type: 'ai-generated',
          title: 'Synthetic model response',
          aiGenerated: {
            modelName: 'Imaginary Model',
            provider: 'Fictional Lab',
            modelVersion: '1',
          },
        }),
        CiteWorkSchema.parse({
          ...book,
          id: 'knowledge',
          type: 'indigenous-knowledge',
          title: 'Synthetic community knowledge',
          indigenous: {
            nationOrCommunity: 'Fictional Community',
            protocolNote: 'Original synthetic fixture only',
          },
        }),
        ...(['edited-book', 'thesis', 'standard', 'software'] as const).map(
          (type) =>
            CiteWorkSchema.parse({
              ...book,
              id: type,
              type,
              title: `Synthetic ${type} source`,
            })
        ),
        ...(['magazine-article', 'conference-paper'] as const).map((type) =>
          CiteWorkSchema.parse({
            ...article,
            id: type,
            type,
            title: `Synthetic ${type} source`,
          })
        ),
        ...(['web-document', 'blog-post'] as const).map((type) =>
          CiteWorkSchema.parse({
            ...webpage,
            id: type,
            type,
            title: `Synthetic ${type} source`,
          })
        ),
      ];
      for (const work of sources) {
        const result = formatWork(work, style);
        expect(toPlainText(result.reference).toLowerCase()).toContain(
          work.title.toLowerCase()
        );
        expect(toPlainText(result.inText)).not.toBe('');
        expect(toPlainText(result.reference)).not.toMatch(
          /<\/?(?:div|i|span)\b/
        );
      }
    }
  );
});

describe('document citation state', () => {
  it.each(['apa', 'harvard'] as const)(
    'assigns stable year suffixes and bibliography order in %s',
    (style) => {
      const alpha = CiteWorkSchema.parse({
        ...book,
        id: 'alpha',
        title: 'Alpha synthetic maps',
      });
      const beta = CiteWorkSchema.parse({
        ...book,
        id: 'beta',
        title: 'Beta synthetic maps',
      });
      const result = formatDocument({
        works: [beta, alpha],
        citations: [
          { id: 'first', items: [{ workId: 'beta' }] },
          { id: 'second', items: [{ workId: 'alpha' }] },
          { id: 'repeat', items: [{ workId: 'beta', locator: '9' }] },
        ],
        style,
      });
      expect(result.bibliography.map(({ workId }) => workId)).toEqual([
        'alpha',
        'beta',
      ]);
      expect(
        toPlainText(result.citations[0]?.output ?? { runs: [] })
      ).toContain('2024b');
      expect(
        toPlainText(result.citations[1]?.output ?? { runs: [] })
      ).toContain('2024a');
      expect(
        toPlainText(result.citations[2]?.output ?? { runs: [] })
      ).toContain('2024b');
      expect(
        formatDocument({
          works: [book],
          citations: [{ id: 'solo', items: [{ workId: book.id }] }],
          style,
        })
          .citations.map(({ output }) => toPlainText(output))
          .join('')
      ).not.toMatch(/2024[ab]/);
    }
  );

  it('supports author suppression and preserves locator text', () => {
    const result = formatWork(article, 'apa', {
      suppressAuthor: true,
      locator: '45',
    });
    expect(toPlainText(result.inText)).toBe('(2024, p. 45)');
  });

  it('distinguishes same-family authors by given-name initials in Harvard', () => {
    const a = CiteWorkSchema.parse({
      ...book,
      id: 'smith-a',
      title: 'Alpha fictional survey',
      authors: [{ kind: 'person', family: 'Smith', given: 'Ari' }],
    });
    const b = CiteWorkSchema.parse({
      ...book,
      id: 'smith-b',
      title: 'Beta fictional survey',
      authors: [{ kind: 'person', family: 'Smith', given: 'Bea' }],
    });
    const result = formatDocument({
      works: [a, b],
      citations: [
        { id: 'a', items: [{ workId: a.id }] },
        { id: 'b', items: [{ workId: b.id }] },
      ],
      style: 'harvard',
    });
    const texts = result.citations.map(({ output }) => toPlainText(output));
    expect(texts[0]).toMatch(/\bA\b/);
    expect(texts[1]).toMatch(/\bB\b/);
    expect(texts[0]).not.toBe(texts[1]);
  });

  it('keeps a newspaper publication date before its accessed date and source URL', () => {
    const news = CiteWorkSchema.parse({
      ...article,
      id: 'dated-news',
      type: 'newspaper-article',
      issued: { year: 2024, month: 6, day: 4 },
      containerTitle: 'Fictional Times',
      doi: undefined,
      url: 'https://example.org/news',
      accessed: '2026-11-16',
    });
    const reference = toPlainText(formatWork(news, 'harvard').reference);
    expect(reference).toContain('4 June');
    expect(reference.indexOf('4 June')).toBeLessThan(
      reference.indexOf('accessed 16 November 2026')
    );
    expect(reference.indexOf('accessed 16 November 2026')).toBeLessThan(
      reference.indexOf('https://example.org/news')
    );
  });

  it('rejects dangling or duplicate document identities rather than rendering another work', () => {
    expect(() =>
      formatDocument({
        works: [book],
        citations: [{ id: 'bad', items: [{ workId: 'missing' }] }],
        style: 'apa',
      })
    ).toThrow('Unknown citation work');
    expect(() =>
      formatDocument({ works: [book, book], citations: [], style: 'apa' })
    ).toThrow('unique');
  });

  it('exports structured works without allowing record/field injection', () => {
    const work = CiteWorkSchema.parse({
      ...book,
      title: 'Synthetic {braces}\nER  - injected',
    });
    expect(toBibTeX(work)).toContain('Synthetic \\{braces\\} ER  - injected');
    expect(
      toRIS(work)
        .split('\n')
        .filter((line) => line.startsWith('ER  -'))
    ).toHaveLength(1);
  });
});
