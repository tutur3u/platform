import { Agent } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { METADATA_MAX_BYTES, type MetadataNetwork } from './metadata-network';
import {
  createSourceResolver,
  recognizeCaptureSource,
} from './source-resolver';

vi.mock('server-only', () => ({}));
afterEach(() => {
  vi.useRealTimers();
});
function networkWith(fetch: MetadataNetwork['fetch']): MetadataNetwork {
  return {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    dispatcher: () => new Agent(),
    fetch,
  };
}

describe('source recognition and aggregate budgets', () => {
  it.each([
    ['arXiv:2501.01234v2', { kind: 'arxiv', value: '2501.01234v2' }],
    ['arxiv:hep-th/9901001', { kind: 'arxiv', value: 'hep-th/9901001' }],
    ['PMID:12345678', { kind: 'pmid', value: '12345678' }],
    [
      'https://pubmed.ncbi.nlm.nih.gov/12345678/',
      { kind: 'pmid', value: '12345678' },
    ],
    ['title: Synthetic source', { kind: 'title', value: 'Synthetic source' }],
    [
      'https://dl.acm.org/doi/abs/10.1145/358923.358934',
      { kind: 'doi', value: '10.1145/358923.358934' },
    ],
    [
      'https://dl.acm.org/doi/pdf/10.1145/358923.358934',
      { kind: 'doi', value: '10.1145/358923.358934' },
    ],
  ])('recognizes %s without network access', (input, expected) => {
    expect(recognizeCaptureSource(String(input))).toEqual(expected);
  });

  it.each([
    'arxiv:2513.12345',
    'pmid:0',
    'pmid:123?url=http://localhost',
    'title:',
    'Unmarked private paragraph',
    'https://pubmed.ncbi.nlm.nih.gov.attacker.example/12345678/',
  ])('rejects ambiguous or malformed source %s', (input) => {
    expect(() => recognizeCaptureSource(input)).toThrow();
  });

  it('permits at most two upstream operations', async () => {
    const fetch = vi.fn(async () => Response.json({}));
    const resolver = createSourceResolver(networkWith(fetch));
    const url = new URL('https://api.crossref.org/works/10.5555%2Ftest');
    await resolver.fetch(url, 'json');
    await resolver.fetch(url, 'json');
    await expect(resolver.fetch(url, 'json')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(resolver.receipt().operations).toBe(2);
  });

  it('shares the256KiB body budget across a cascade', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('x'.repeat(150_000), {
          headers: { 'content-type': 'application/json' },
        })
    );
    const resolver = createSourceResolver(networkWith(fetch));
    const url = new URL('https://api.crossref.org/works/10.5555%2Ftest');
    expect((await resolver.fetch(url, 'json')).length).toBe(150_000);
    await expect(resolver.fetch(url, 'json')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
    expect(METADATA_MAX_BYTES).toBe(262_144);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent reads within the same aggregate byte budget', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('x'.repeat(150_000), {
          headers: { 'content-type': 'application/json' },
        })
    );
    const resolver = createSourceResolver(networkWith(fetch));
    const url = new URL('https://api.crossref.org/works/10.5555%2Ftest');
    const results = await Promise.allSettled([
      resolver.fetch(url, 'json'),
      resolver.fetch(url, 'json'),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { code: 'RESPONSE_TOO_LARGE' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never refunds a failed streamed body to another identifier', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(METADATA_MAX_BYTES));
              controller.enqueue(new Uint8Array(1));
              controller.close();
            },
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    );
    const resolver = createSourceResolver(networkWith(fetch));
    const url = new URL('https://api.crossref.org/works/10.5555%2Ftest');
    await expect(resolver.fetch(url, 'json')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
    await expect(resolver.fetch(url, 'json')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops queued reads after a partially consumed body errors', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(128));
            },
            pull(controller) {
              controller.error(new Error('synthetic stream failure'));
            },
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    );
    const resolver = createSourceResolver(networkWith(fetch));
    const url = new URL('https://api.crossref.org/works/10.5555%2Ftest');
    const results = await Promise.allSettled([
      resolver.fetch(url, 'json'),
      resolver.fetch(url, 'json'),
    ]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not reset its deadline for a second registry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => Response.json({}));
    const resolver = createSourceResolver(networkWith(fetch));
    const url = new URL('https://api.crossref.org/works/10.5555%2Ftest');
    await resolver.fetch(url, 'json');
    vi.setSystemTime(Date.now() + 5001);
    await expect(resolver.fetch(url, 'json')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
