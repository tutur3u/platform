import { describe, expect, it, vi } from 'vitest';
import { parseHtmlCitation } from './capture-webpage';

vi.mock('server-only', () => ({}));

const url = new URL('https://www.nature.com/articles/synthetic');

describe('HTML citation metadata boundaries', () => {
  it('cleans and bounds JSON-LD page, volume and issue fields as plain text', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'ScholarlyArticle', headline: 'Synthetic locators', volumeNumber: '<b>4</b>', issueNumber: '&lt;i&gt;2&lt;/i&gt;', pageStart: '<b>15</b>', pageEnd: `<b>${'9'.repeat(300)}</b>` })}</script>`;
    expect(parseHtmlCitation(html, url).fields).toMatchObject({
      volume: '4',
      issue: '2',
      pages: `15-${'9'.repeat(197)}`,
    });
  });

  it('parses JSON-LD graphs and preserves structured names and organizations', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Ignored site shell' },
        {
          '@type': 'ScholarlyArticle',
          headline: 'Synthetic linked-data article',
          datePublished: '2025-04-03',
          author: [
            { '@type': 'Person', givenName: 'Ari', familyName: 'Chen' },
            { '@type': 'Organization', name: 'Example Research Collective' },
          ],
          publisher: { name: 'Example Press' },
          isPartOf: { name: 'Invented Studies' },
          pagination: '15-29',
          volumeNumber: '4',
          inLanguage: 'en',
        },
      ],
    })}</script>`;
    expect(parseHtmlCitation(html, url)).toMatchObject({
      fields: {
        title: 'Synthetic linked-data article',
        year: 2025,
        pages: '15-29',
        containerTitle: 'Invented Studies',
      },
      extra: {
        type: 'journal-article',
        issued: { year: 2025, month: 4, day: 3 },
        authors: [
          { kind: 'person', family: 'Chen', given: 'Ari' },
          { kind: 'organization', name: 'Example Research Collective' },
        ],
        language: 'en',
      },
    });
  });

  it('extracts Dublin Core names, dates, title and publisher', () => {
    expect(
      parseHtmlCitation(
        '<meta name="DC.Title" content="Synthetic DC report"><meta name="DC.Creator" content="Reed, Morgan"><meta name="DCTERMS.issued" content="2024-08-12"><meta name="dc.publisher" content="Imaginary Council">',
        url
      )
    ).toMatchObject({
      fields: {
        title: 'Synthetic DC report',
        authors: [{ family: 'Reed', given: 'Morgan' }],
        year: 2024,
        publisher: 'Imaginary Council',
      },
    });
  });

  it('prefers Highwire metadata over JSON-LD and ignores executable markup', () => {
    const html = `<meta name="citation_title" content="Highwire title &amp; context"><meta name="citation_pages" content="e42"><meta name="citation_firstpage" content="1"><meta name="citation_lastpage" content="99"><script type="application/ld+json">{"@type":"Article","headline":"LD title"}</script><script>fetch('http://localhost')</script>`;
    expect(parseHtmlCitation(html, url)).toMatchObject({
      fields: { title: 'Highwire title & context', pages: 'e42' },
    });
  });

  it('handles malformed JSON-LD by falling back to parsed HTML title', () => {
    expect(
      parseHtmlCitation(
        '<script type="application/ld+json">{bad</script><title>Safe &amp; synthetic</title>',
        url
      )
    ).toMatchObject({ fields: { title: 'Safe & synthetic' } });
  });

  it('never resolves remote JSON-LD contexts or follows embedded source URLs', () => {
    const html = `<script type="application/ld+json">{"@context":"http://169.254.169.254/","@type":"Dataset","name":"Synthetic dataset","url":"http://127.0.0.1/"}</script>`;
    const result = parseHtmlCitation(html, url);
    expect(result).toMatchObject({
      fields: { title: 'Synthetic dataset', URL: url.toString() },
      extra: { type: 'dataset' },
    });
  });

  it('bounds JSON-LD script size and graph traversal', () => {
    const oversized = JSON.stringify({
      '@type': 'Article',
      headline: 'x'.repeat(40_000),
    });
    expect(
      parseHtmlCitation(
        `<script type="application/ld+json">${oversized}</script><title>Fallback title</title>`,
        url
      ).fields.title
    ).toBe('Fallback title');
    expect(
      parseHtmlCitation(
        `<script type="application/ld+json">${JSON.stringify({ '@graph': Array.from({ length: 50 }, () => ({ '@type': 'Article', headline: 'oversized graph' })) })}</script>`,
        url
      ).fields.title
    ).toBe('');
  });
});
