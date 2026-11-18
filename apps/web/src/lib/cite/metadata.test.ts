import { Agent } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import { lookupCitation } from './metadata';
import type { MetadataNetwork } from './metadata-network';

vi.mock('server-only', () => ({}));

function networkFor(body: unknown, status = 200) {
  const fetch = vi.fn(async (_url: URL, _init: unknown) =>
    Response.json(body, { status })
  );
  const network: MetadataNetwork = {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    dispatcher: () => new Agent(),
    fetch,
  };
  return { network, fetch };
}

describe('citation source metadata', () => {
  it('does not start a legacy lookup after caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const { network, fetch } = networkFor({});
    await expect(
      lookupCitation('10.5555/synthetic', network, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps synthetic DOI metadata with one pinned registry request', async () => {
    const { network, fetch } = networkFor({
      message: {
        title: ['<i>Patterns in a fictional ecosystem</i>'],
        author: [{ family: 'Chen', given: 'Ari' }],
        published: { 'date-parts': [[2025, 2, 3]] },
        'container-title': ['Synthetic Studies'],
        type: 'journal-article',
        volume: '4',
        issue: '2',
        page: '10-18',
      },
    });
    const result = await lookupCitation(
      'https://doi.org/10.5555/synthetic.42',
      network
    );
    expect(result).toMatchObject({
      source: 'crossref',
      needsReview: true,
      fields: {
        type: 'article-journal',
        title: 'Patterns in a fictional ecosystem',
        authors: [{ family: 'Chen', given: 'Ari' }],
        year: 2025,
        containerTitle: 'Synthetic Studies',
        DOI: '10.5555/synthetic.42',
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      'https://api.crossref.org/works/10.5555%2Fsynthetic.42'
    );
  });

  it('maps a checksum-valid ISBN to synthetic book data', async () => {
    const { network, fetch } = networkFor({
      'ISBN:9781234567897': {
        title: 'Imagined Islands',
        authors: [{ name: 'Morgan Reed' }],
        publishers: [{ name: 'Example Press' }],
        publish_date: '2024',
      },
    });
    expect(
      await lookupCitation('ISBN: 978-1-234-56789-7', network)
    ).toMatchObject({
      source: 'openlibrary',
      fields: {
        type: 'book',
        title: 'Imagined Islands',
        authors: [{ family: 'Reed', given: 'Morgan' }],
        year: 2024,
        ISBN: '9781234567897',
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid ISBN checksums without network access', async () => {
    const { network, fetch } = networkFor({});
    await expect(
      lookupCitation('9781234567890', network)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps unsupported URLs as explicit manual fields without fetching', async () => {
    const { network, fetch } = networkFor({});
    const result = await lookupCitation(
      'https://publisher.example/article#section',
      network
    );
    expect(result).toMatchObject({
      source: 'manual',
      needsReview: true,
      fields: {
        type: 'webpage',
        title: '',
        URL: 'https://publisher.example/article',
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('extracts bounded HTML metadata for an exact supported host', async () => {
    const { network } = networkFor({});
    network.fetch = vi.fn(
      async () =>
        new Response(
          `<html><title>Fallback</title>
      <meta name="citation_title" content="Synthetic birds &amp; clouds">
      <meta content='Reed, Morgan' name='citation_author'>
      <meta name="citation_journal_title" content="Imaginary Nature">
      <meta name="citation_publication_date" content="2025/03/04">
      <meta name="citation_doi" content="10.5555/synthetic">
      <meta name="citation_firstpage" content="15">
      <meta name="citation_lastpage" content="29">
      <script>window.location='http://127.0.0.1/'</script></html>`,
          { headers: { 'content-type': 'text/html' } }
        )
    );
    expect(
      await lookupCitation('https://www.nature.com/articles/synthetic', network)
    ).toMatchObject({
      source: 'webpage',
      fields: {
        title: 'Synthetic birds & clouds',
        type: 'article-journal',
        authors: [{ family: 'Reed', given: 'Morgan' }],
        year: 2025,
        pages: '15-29',
      },
    });
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it('prefers explicit citation pages over first and last page', async () => {
    const { network } = networkFor({});
    network.fetch = async () =>
      new Response(
        '<meta name="citation_pages" content="e42"><meta name="citation_firstpage" content="15"><meta name="citation_lastpage" content="29">',
        { headers: { 'content-type': 'text/html' } }
      );
    expect(
      await lookupCitation('https://arxiv.org/abs/synthetic', network)
    ).toMatchObject({ fields: { pages: 'e42' } });
  });

  it('decodes named and numeric registry entities once before removing tags', async () => {
    const { network } = networkFor({
      message: {
        title: [
          'Birds &amp; clouds &#8212; &lt;i&gt;synthetic&lt;/i&gt; &amp;amp;',
        ],
        author: [{ family: 'O&#39;Reed', given: 'Ari' }],
      },
    });
    expect(await lookupCitation('10.5555/entities', network)).toMatchObject({
      fields: {
        title: 'Birds & clouds — synthetic &amp;',
        authors: [{ family: "O'Reed", given: 'Ari' }],
      },
    });
  });

  it.each(['Synthetic <unfinished', 'Synthetic &lt;unfinished'])(
    'discards incomplete metadata markup: %s',
    async (title) => {
      const { network } = networkFor({ message: { title: [title] } });
      expect(await lookupCitation('10.5555/incomplete', network)).toMatchObject(
        { fields: { title: 'Synthetic' } }
      );
    }
  );

  it('discards script and style contents while retaining source title text', async () => {
    const { network } = networkFor({
      message: {
        title: [
          'Synthetic<script>untrusted()</script><style>body{}</style> source',
        ],
      },
    });
    expect(await lookupCitation('10.5555/script', network)).toMatchObject({
      fields: { title: 'Synthetic source' },
    });
  });

  it.each([
    [
      'Synthetic <scr<script>ipt>payload</scr<script>ipt> source',
      'Synthetic ipt>payloadipt> source',
    ],
    ['Synthetic <script', 'Synthetic script'],
    ['Synthetic <!-- hidden --> source', 'Synthetic source'],
    ['<span data-note="a > b">Synthetic</span> source', 'Synthetic source'],
    ['<![CDATA[Synthetic <b>literal</b>]]>', 'Synthetic <b>literal</b>'],
    ['&amp;lt;script&amp;gt;', '&lt;script&gt;'],
  ])(
    'extracts bounded literal text from malformed or encoded metadata: %s',
    async (title, expected) => {
      const { network } = networkFor({ message: { title: [title] } });
      expect(await lookupCitation('10.5555/markup', network)).toMatchObject({
        fields: { title: expected },
      });
    }
  );

  it('retains the output cap after parsing and entity decoding', async () => {
    const { network } = networkFor({
      message: { title: [`<i>${'x'.repeat(3000)}</i>`] },
    });
    expect(
      (await lookupCitation('10.5555/bounded', network)).fields.title
    ).toBe('x'.repeat(1000));
  });

  it('decodes webpage entities only once', async () => {
    const { network } = networkFor({});
    network.fetch = async () =>
      new Response(
        '<meta name="citation_title" content="Birds &amp;amp; clouds"><meta name="citation_author" content="O&amp;amp;Reed, Ari">',
        { headers: { 'content-type': 'text/html' } }
      );
    expect(
      await lookupCitation('https://arxiv.org/abs/synthetic', network)
    ).toMatchObject({
      fields: {
        title: 'Birds &amp; clouds',
        authors: [{ family: 'O&amp;Reed', given: 'Ari' }],
      },
    });
  });

  it.each([
    'file:///etc/passwd',
    'https://user:pass@www.nature.com/article',
    'https://www.nature.com:444/article',
    '10.5555/a?redirect=x',
    '',
  ])('rejects malformed source %s', async (input) => {
    const { network, fetch } = networkFor({});
    await expect(lookupCitation(input, network)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an allow-listed host suffix before network access', async () => {
    const { network, fetch } = networkFor({});
    await expect(
      lookupCitation('https://www.nature.com.attacker.example/article', network)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://user:pass@www.nature.com/article',
    'https://@www.nature.com/article',
    'https://www.nature.com:444/article',
    'https://127.0.0.1/article',
    'https://2130706433/article',
    'https://[::1]/article',
    'https://www.nature.com./article',
    'https://ｗｗｗ.nature.com/article',
    'https://www。nature.com/article',
    'https://%77ww.nature.com/article',
    'https://xn--nature-9za.com/article',
    'https://www.nature.com\\@attacker.example/article',
    'https://arxiv.org.attacker.example/article',
    'https://foo.arxiv.org/article',
  ])('rejects authority trick %s before DNS or fetch', async (value) => {
    const { network, fetch } = networkFor({});
    network.resolve = vi.fn(network.resolve);
    await expect(lookupCitation(value, network)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(network.resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    '10.5555/test%2fpart',
    '10.5555/test?url=x',
    '10.5555/<script>',
    '10.5555/with space',
    '10.5555/é',
  ])('rejects invalid DOI syntax %s without fetching', async (value) => {
    const { network, fetch } = networkFor({});
    await expect(lookupCitation(value, network)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch URLs returned in registry metadata', async () => {
    const { network, fetch } = networkFor({
      message: {
        title: ['Synthetic single-request metadata'],
        URL: 'http://169.254.169.254/',
        link: [{ URL: 'https://attacker.example/file' }],
      },
    });
    const result = await lookupCitation('10.5555/no-followup', network);
    expect(result.fields.URL).toBe('https://doi.org/10.5555/no-followup');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a stable not-found outcome for absent registry data', async () => {
    const { network } = networkFor({}, 404);
    await expect(
      lookupCitation('10.5555/missing', network)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('rejects a malformed provider JSON schema', async () => {
    const { network } = networkFor({ message: { title: 'wrong shape' } });
    await expect(
      lookupCitation('10.5555/malformed', network)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it.each([
    'https://dl.acm.org/doi/abs/10.1145/358923.358934',
    'https://dl.acm.org/doi/pdf/10.1145/358923.358934',
    'https://dl.acm.org/doi/10.1145/358923.358934?download=true',
    'https://publisher.example/files/10.1145/358923.358934.pdf',
  ])(
    'resolves a DOI inside the publisher link %s through the registry only',
    async (link) => {
      const { network, fetch } = networkFor({
        message: {
          title: ['Synthetic indexing'],
          author: [{ family: 'Vale', given: 'Mira' }],
          published: { 'date-parts': [[1979]] },
          type: 'journal-article',
        },
      });
      const result = await lookupCitation(link, network);
      expect(result).toMatchObject({
        source: 'crossref',
        fields: { DOI: '10.1145/358923.358934', title: 'Synthetic indexing' },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]?.[0])).toBe(
        'https://api.crossref.org/works/10.1145%2F358923.358934'
      );
    }
  );

  it.each([404, 500])(
    'keeps a publisher link as a manual entry when the registry answers %s',
    async (status) => {
      const { network } = networkFor({}, status);
      const result = await lookupCitation(
        'https://publisher.example/doi/abs/10.5555/synthetic',
        network
      );
      expect(result).toMatchObject({
        source: 'manual',
        fields: {
          type: 'webpage',
          URL: 'https://publisher.example/doi/abs/10.5555/synthetic',
        },
      });
    }
  );

  it('keeps a PDF link without an identifier as a manual entry without fetching', async () => {
    const { network, fetch } = networkFor({});
    const result = await lookupCitation(
      'https://university.example/papers/outline.pdf',
      network
    );
    expect(result).toMatchObject({
      source: 'manual',
      fields: { URL: 'https://university.example/papers/outline.pdf' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
