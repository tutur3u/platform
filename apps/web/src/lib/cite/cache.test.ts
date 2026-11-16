import { type CiteWork, fromLegacyCitationFields } from '@tuturuuu/cite';
import { describe, expect, it, vi } from 'vitest';
import {
  citationCacheKey,
  CITATION_CACHE_TTL_SECONDS,
  type CitationCache,
  readCitationCache,
  writeCitationCache,
} from './cache';
import type { CaptureSource } from './source-resolver';

vi.mock('server-only', () => ({}));
const doi = { kind: 'doi', value: '10.5555/synthetic' } satisfies CaptureSource;
function registryWork(): CiteWork {
  return fromLegacyCitationFields(
    {
      type: 'article-journal',
      title: 'Synthetic registry work',
      authors: [],
      DOI: doi.value,
    },
    {
      provenance: {
        sourceCaptureMethod: 'doi',
        verificationStatus: 'verified_registry',
        registry: 'crossref',
      },
    }
  );
}

describe('public citation cache', () => {
  it('preserves public registry citation and identity fields across a cache round trip', async () => {
    const work: CiteWork = {
      ...registryWork(),
      articleNumber: 'e42',
      genre: 'preprint',
      language: 'en',
      pmid: '12345678',
    };
    let stored: unknown = null;
    const cache: CitationCache = {
      get: async () => stored,
      set: async (_key, value) => {
        stored = value;
        return null;
      },
    };
    await writeCitationCache(doi, work, cache, 1000);
    expect(await readCitationCache(doi, cache, 1000)).toMatchObject({
      articleNumber: 'e42',
      genre: 'preprint',
      language: 'en',
      pmid: '12345678',
    });
  });
  it('keys only public DOI/ISBN identifiers with a versioned digest', () => {
    const key = citationCacheKey(doi);
    expect(key).toMatch(/^cite:metadata:v1:doi:[0-9a-f]{64}$/);
    expect(key).not.toContain(doi.value);
    expect(
      citationCacheKey({ kind: 'doi', value: doi.value.toUpperCase() })
    ).toBe(key);
    expect(
      citationCacheKey({ kind: 'title', value: 'private title' })
    ).toBeNull();
    expect(
      citationCacheKey({
        kind: 'url',
        url: new URL('https://publisher.example/private?token=secret'),
      })
    ).toBeNull();
    expect(citationCacheKey({ kind: 'pmid', value: '12345678' })).toBeNull();
  });

  it('validates a cached work and removes non-registry/private properties', async () => {
    const work: CiteWork = {
      ...registryWork(),
      abstract: 'private annotation',
      aiGenerated: {
        modelName: 'private prompt model',
        promptShareUrl: 'https://private.example/prompt',
      },
      url: 'https://publisher.example/private?secret=token',
    };
    const cache: CitationCache = {
      get: vi.fn(async () => work),
      set: vi.fn(async () => null),
    };
    const result = await readCitationCache(doi, cache, 1000);
    expect(result).toMatchObject({
      doi: doi.value,
      url: 'https://doi.org/10.5555/synthetic',
    });
    expect(result).not.toHaveProperty('abstract');
    expect(result).not.toHaveProperty('aiGenerated');
  });

  it('does not accept a cache record for a different public identifier', async () => {
    const work = { ...registryWork(), doi: '10.5555/other' };
    const cache: CitationCache = {
      get: vi.fn(async () => work),
      set: vi.fn(async () => null),
    };
    expect(await readCitationCache(doi, cache, 1000)).toBeNull();
  });

  it('does not read or write a title search, URL query or manual library work', async () => {
    const cache: CitationCache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => null),
    };
    for (const source of [
      { kind: 'title', value: 'private search' },
      {
        kind: 'url',
        url: new URL('https://publisher.example/private?token=x'),
      },
    ] satisfies CaptureSource[]) {
      expect(await readCitationCache(source, cache, 1000)).toBeNull();
      await writeCitationCache(source, registryWork(), cache, 1000);
    }
    const manual: CiteWork = {
      ...registryWork(),
      provenance: {
        sourceCaptureMethod: 'manual',
        verificationStatus: 'manual',
      },
    };
    await writeCitationCache(doi, manual, cache, 1000);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('stores a bounded registry projection for24h with no prompt or query', async () => {
    const set = vi.fn(
      async (
        _key: string,
        _value: CiteWork,
        _ttl: number,
        _signal: AbortSignal
      ) => null
    );
    const cache: CitationCache = { get: async () => null, set };
    await writeCitationCache(
      doi,
      {
        ...registryWork(),
        abstract: 'private annotation',
        url: 'https://private.example/?token=x',
      },
      cache,
      1000
    );
    expect(set).toHaveBeenCalledTimes(1);
    const args = set.mock.calls[0];
    expect(args?.[2]).toBe(CITATION_CACHE_TTL_SECONDS);
    expect(args?.[1].url).toBe('https://doi.org/10.5555/synthetic');
    expect(args?.[1]).not.toHaveProperty('abstract');
    expect(JSON.stringify(args?.[1])).not.toContain('private');
  });

  it('treats cache failures as a miss without retrying', async () => {
    const get = vi.fn(async () => {
      throw new Error('store unavailable');
    });
    const cache: CitationCache = { get, set: async () => null };
    expect(await readCitationCache(doi, cache, 1000)).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled cache read and aborts it once', async () => {
    const abort = vi.fn();
    const get = vi.fn(async (_key: string, signal: AbortSignal) => {
      signal.addEventListener('abort', abort);
      return new Promise<never>(() => {});
    });
    expect(
      await readCitationCache(doi, { get, set: async () => null }, 10)
    ).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('skips cache calls when the aggregate deadline is exhausted', async () => {
    const cache: CitationCache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => null),
    };
    expect(await readCitationCache(doi, cache, 0)).toBeNull();
    await writeCitationCache(doi, registryWork(), cache, 0);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
