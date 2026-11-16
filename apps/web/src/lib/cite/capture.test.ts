import { CiteWorkSchema, fromLegacyCitationFields } from '@tuturuuu/cite';
import { Agent } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import { captureCitation, createCitationGroundingSession } from './capture';
import type { CitationCache } from './cache';
import type { MetadataNetwork } from './metadata-network';

vi.mock('server-only', () => ({}));

function networkWith(fetch: MetadataNetwork['fetch']): MetadataNetwork {
  return {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    dispatcher: () => new Agent(),
    fetch,
  };
}
const syntheticArticle = {
  id: 'https://openalex.org/W12345',
  doi: 'https://doi.org/10.5555/synthetic',
  title: 'Synthetic registry article',
  publication_year: 2025,
  publication_date: '2025-02-03',
  type: 'article',
  authorships: [{ author: { display_name: 'Ari Chen', orcid: null } }],
  primary_location: {
    source: {
      display_name: 'Invented Studies',
      host_organization_name: 'Example Press',
    },
  },
  ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/12345678' },
  biblio: { volume: '4', issue: '2', first_page: '15', last_page: '28' },
  language: 'en',
};

describe('bounded citation capture', () => {
  it.each([undefined, ''])(
    'keeps a Crossref response without returned DOI unverified and uncached (%s)',
    async (returnedDoi) => {
      const fetch = vi.fn(async () =>
        Response.json({
          message: {
            title: ['Synthetic unverified metadata'],
            DOI: returnedDoi,
          },
        })
      );
      const cache: CitationCache = {
        get: vi.fn(async () => null),
        set: vi.fn(async () => null),
      };
      const result = await captureCitation('10.5555/requested', {
        network: networkWith(fetch),
        cache,
      });
      expect(result).toMatchObject({
        kind: 'captured',
        needsReview: true,
        work: {
          provenance: {
            sourceCaptureMethod: 'doi',
            verificationStatus: 'manual',
            registry: 'crossref',
          },
        },
      });
      expect(cache.set).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('cleans and bounds OpenAlex print locators before canonical validation', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        ...syntheticArticle,
        biblio: {
          volume: '<b>4</b>',
          issue: '&lt;i&gt;2&lt;/i&gt;',
          first_page: '<script>ignored()</script><b>15</b>',
          last_page: `<b>${'9'.repeat(300)}</b>`,
        },
      })
    );
    const result = await captureCitation('PMID:12345678', {
      network: networkWith(fetch),
      cache: null,
    });
    if (result.kind !== 'captured')
      throw new Error('Expected a captured source');
    expect(result.work.volume).toBe('4');
    expect(result.work.issue).toBe('2');
    expect(result.work.pages).toBe(`15-${'9'.repeat(197)}`);
  });

  it('shares the AI grounding two-read budget across identifiers and DOI fallback', async () => {
    const fetch = vi.fn(async (url: URL) =>
      url.hostname === 'api.crossref.org'
        ? new Response('', { status: 404 })
        : Response.json(syntheticArticle)
    );
    const session = createCitationGroundingSession({
      signal: new AbortController().signal,
      network: networkWith(fetch),
    });
    expect(await session.capture('10.5555/synthetic')).toMatchObject({
      kind: 'captured',
      receipt: { operations: 2 },
    });
    await expect(session.capture('PMID:12345678')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.receipt().operations).toBe(2);
  });

  it('does not permit titles or ordinary URLs as model grounding identifiers', async () => {
    const fetch = vi.fn(async () => Response.json({}));
    const session = createCitationGroundingSession({
      signal: new AbortController().signal,
      network: networkWith(fetch),
    });
    await expect(
      session.capture('title: private unverified model text')
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      session.capture('https://www.nature.com/articles/synthetic')
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps caller cancellation terminal across later grounding calls', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => Response.json({}));
    const session = createCitationGroundingSession({
      signal: controller.signal,
      network: networkWith(fetch),
    });
    controller.abort();
    await expect(session.capture('10.5555/synthetic')).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(session.capture('PMID:12345678')).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves a validated public DOI cache hit without an upstream operation', async () => {
    const work = fromLegacyCitationFields(
      {
        type: 'article-journal',
        title: 'Synthetic cached work',
        authors: [],
        DOI: '10.5555/cached',
      },
      {
        provenance: {
          sourceCaptureMethod: 'doi',
          verificationStatus: 'verified_registry',
          registry: 'crossref',
        },
      }
    );
    const fetch = vi.fn(async () => Response.json({}));
    const cache: CitationCache = {
      get: vi.fn(async () => work),
      set: vi.fn(async () => null),
    };
    expect(
      await captureCitation('10.5555/cached', {
        network: networkWith(fetch),
        cache,
      })
    ).toMatchObject({
      kind: 'captured',
      cache: 'hit',
      receipt: { operations: 0 },
      work: { title: 'Synthetic cached work' },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('maps Crossref chapters, full dates, editors, corporate authors and print fields', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        message: {
          DOI: '10.5555/chapter',
          type: 'book-chapter',
          title: ['Invented chapter &amp; context'],
          author: [
            { name: 'Synthetic Research Collective' },
            {
              family: 'Chen',
              given: 'Ari',
              ORCID: 'https://orcid.org/0000-0000-0000-000X',
            },
          ],
          editor: [{ family: 'Reed', given: 'Morgan' }],
          translator: [{ family: 'Nguyen', given: 'Linh' }],
          issued: { 'date-parts': [[2025, 2, 3]] },
          'container-title': ['Synthetic Handbook'],
          publisher: 'Example Press',
          'publisher-location': 'Imaginary City',
          'edition-number': 2,
          page: '15-28',
          ISBN: ['9781234567897'],
          language: 'en',
        },
      })
    );
    const result = await captureCitation('DOI:10.5555/CHAPTER', {
      network: networkWith(fetch),
      cache: null,
    });
    expect(result.kind).toBe('captured');
    if (result.kind !== 'captured')
      throw new Error('Expected a captured chapter');
    expect(CiteWorkSchema.safeParse(result.work).success).toBe(true);
    expect(result.work).toMatchObject({
      type: 'book-chapter',
      title: 'Invented chapter & context',
      issued: { year: 2025, month: 2, day: 3 },
      authors: [
        { kind: 'organization', name: 'Synthetic Research Collective' },
        {
          kind: 'person',
          family: 'Chen',
          given: 'Ari',
          orcid: '0000-0000-0000-000X',
        },
      ],
      editors: [{ kind: 'person', family: 'Reed' }],
      translators: [{ kind: 'person', family: 'Nguyen' }],
      containerTitle: 'Synthetic Handbook',
      publisherPlace: 'Imaginary City',
      edition: '2',
      isbn: '9781234567897',
      pages: '15-28',
      provenance: {
        sourceCaptureMethod: 'doi',
        verificationStatus: 'verified_registry',
        registry: 'crossref',
      },
    });
    expect(result.receipt.operations).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses one OpenAlex fallback only after a Crossref 404', async () => {
    const fetch = vi.fn(async (url: URL) =>
      url.hostname === 'api.crossref.org'
        ? new Response('', { status: 404 })
        : Response.json(syntheticArticle)
    );
    const result = await captureCitation('10.5555/synthetic', {
      network: networkWith(fetch),
      cache: null,
    });
    expect(result).toMatchObject({
      kind: 'captured',
      source: 'openalex',
      receipt: { operations: 2 },
      work: {
        doi: '10.5555/synthetic',
        pmid: '12345678',
        pages: '15-28',
        issued: { year: 2025, month: 2, day: 3 },
        provenance: { registry: 'openalex' },
      },
    });
    expect(fetch.mock.calls.map(([url]) => url.hostname)).toEqual([
      'api.crossref.org',
      'api.openalex.org',
    ]);
    expect(fetch.mock.calls[1]?.[0].pathname).toBe(
      '/works/doi:10.5555%2Fsynthetic'
    );
  });

  it.each([429, 500, 403])(
    'does not fallback or retry on upstream %s',
    async (status) => {
      const fetch = vi.fn(async () => new Response('', { status }));
      await expect(
        captureCitation('10.5555/synthetic', {
          network: networkWith(fetch),
          cache: null,
        })
      ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('requires a matching registry DOI rather than silently changing source identity', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        message: { DOI: '10.5555/other', title: ['Wrong synthetic work'] },
      })
    );
    await expect(
      captureCitation('10.5555/requested', {
        network: networkWith(fetch),
        cache: null,
      })
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('maps OpenLibrary publisher, location, edition and named authors', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        'ISBN:9781234567897': {
          title: 'Synthetic Islands',
          authors: [{ name: 'Morgan Reed' }],
          publish_date: '2024',
          publishers: [{ name: 'Imaginary Press' }],
          publish_places: [{ name: 'Example City' }],
          edition_name: 'Third edition',
        },
      })
    );
    expect(
      await captureCitation('978-1-234-56789-7', {
        network: networkWith(fetch),
        cache: null,
      })
    ).toMatchObject({
      kind: 'captured',
      source: 'openlibrary',
      work: {
        type: 'book',
        isbn: '9781234567897',
        publisherPlace: 'Example City',
        edition: 'Third edition',
        authors: [{ kind: 'person', family: 'Reed' }],
      },
    });
  });

  it('returns title-search candidates without selecting a result or forwarding a paragraph implicitly', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        results: [
          syntheticArticle,
          {
            ...syntheticArticle,
            id: 'https://openalex.org/W23456',
            doi: null,
            title: 'Another synthetic candidate',
          },
        ],
      })
    );
    const network = networkWith(fetch);
    const result = await captureCitation('title: Synthetic registry article', {
      network,
      cache: null,
    });
    expect(result.kind).toBe('candidates');
    if (result.kind !== 'candidates') throw new Error('Expected candidates');
    expect(result.candidates).toHaveLength(2);
    expect(result).not.toHaveProperty('work');
    expect(
      result.candidates.every((work) => CiteWorkSchema.safeParse(work).success)
    ).toBe(true);
    await expect(
      captureCitation('Private paragraph without explicit search intent', {
        network,
        cache: null,
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined])(
    'keeps valid title candidates when another candidate has no title: %s',
    async (title) => {
      const fetch = vi.fn(async () =>
        Response.json({
          results: [
            syntheticArticle,
            { ...syntheticArticle, id: 'https://openalex.org/W23456', title },
          ],
        })
      );
      const result = await captureCitation(
        'title: Synthetic registry article',
        { network: networkWith(fetch), cache: null }
      );
      expect(result.kind).toBe('candidates');
      if (result.kind !== 'candidates') throw new Error('Expected candidates');
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.title).toBe('Synthetic registry article');
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('recognizes PMID URLs and never calls a registry-selected landing URL', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        ...syntheticArticle,
        primary_location: { landing_page_url: 'http://169.254.169.254/' },
      })
    );
    const result = await captureCitation(
      'https://pubmed.ncbi.nlm.nih.gov/12345678/',
      { network: networkWith(fetch), cache: null }
    );
    expect(result).toMatchObject({
      kind: 'captured',
      work: { pmid: '12345678', provenance: { sourceCaptureMethod: 'pmid' } },
      receipt: { operations: 1 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a PMID response that identifies another record', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        ...syntheticArticle,
        ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/87654321' },
      })
    );
    await expect(
      captureCitation('PMID:12345678', {
        network: networkWith(fetch),
        cache: null,
      })
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('captures arXiv as a preprint from its canonical abstract URL', async () => {
    const fetch = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe('https://arxiv.org/abs/2501.01234v2');
      return new Response(
        '<meta name="citation_title" content="Synthetic preprint"><meta name="citation_author" content="Ari Chen"><meta name="citation_publication_date" content="2025/01/03">',
        { headers: { 'content-type': 'text/html' } }
      );
    });
    expect(
      await captureCitation('https://arxiv.org/pdf/2501.01234v2.pdf', {
        network: networkWith(fetch),
        cache: null,
      })
    ).toMatchObject({
      kind: 'captured',
      source: 'arxiv',
      work: {
        arxivId: '2501.01234v2',
        genre: 'preprint',
        archive: 'arXiv',
        provenance: {
          sourceCaptureMethod: 'arxiv',
          verificationStatus: 'url_scraped',
        },
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a manual draft for unsupported hosts without cache or provider reads', async () => {
    const fetch = vi.fn(async () => Response.json({}));
    const cache: CitationCache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => null),
    };
    const result = await captureCitation(
      'https://publisher.example/paper?private=token',
      { network: networkWith(fetch), cache }
    );
    expect(result).toMatchObject({
      kind: 'manual',
      fields: { title: '' },
      receipt: { operations: 0 },
    });
    expect(result).not.toHaveProperty('work');
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
