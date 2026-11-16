import 'server-only';

import { type CiteWork, toLegacyCitationFields } from '@tuturuuu/cite';
import {
  type CitationCache,
  publicCitationCache,
  readCitationCache,
  writeCitationCache,
} from './cache';
import {
  buildCapturedWork,
  mapCrossref,
  mapOpenAlex,
  mapOpenLibrary,
  OPENALEX_SELECT,
} from './capture-registry';
import { parseHtmlCitation } from './capture-webpage';
import {
  CitationLookupError,
  type MetadataNetwork,
  WEBPAGE_HOSTS,
} from './metadata-network';
import {
  createSourceResolver,
  recognizeCaptureSource,
  type SourceResolver,
} from './source-resolver';
import type { CitationFields } from './types';

type Receipt = { operations: number; elapsedMs: number };
type CapturedSource =
  | 'crossref'
  | 'openalex'
  | 'openlibrary'
  | 'webpage'
  | 'arxiv';
export type CitationCaptureResult =
  | {
      kind: 'captured';
      work: CiteWork;
      fields: CitationFields;
      source: CapturedSource;
      needsReview: true;
      cache: 'hit' | 'miss' | 'bypassed';
      receipt: Receipt;
    }
  | {
      kind: 'candidates';
      candidates: CiteWork[];
      source: 'openalex';
      needsReview: true;
      receipt: Receipt;
    }
  | {
      kind: 'manual';
      fields: CitationFields;
      source: 'manual';
      needsReview: true;
      receipt: Receipt;
    };

function openAlexUrl(path: string) {
  const url = new URL(`https://api.openalex.org${path}`);
  url.searchParams.set('select', OPENALEX_SELECT);
  return url;
}

function captured(
  work: CiteWork,
  source: CapturedSource,
  cache: 'hit' | 'miss' | 'bypassed',
  resolver: SourceResolver
): CitationCaptureResult {
  resolver.assertActive();
  return {
    kind: 'captured',
    work,
    fields: toLegacyCitationFields(work),
    source,
    needsReview: true,
    cache,
    receipt: resolver.receipt(),
  };
}

export async function captureCitation(
  input: string,
  options: {
    network?: MetadataNetwork;
    cache?: CitationCache | null;
    resolver?: SourceResolver;
    signal?: AbortSignal;
  } = {}
): Promise<CitationCaptureResult> {
  const source = recognizeCaptureSource(input);
  const resolver =
    options.resolver ?? createSourceResolver(options.network, options.signal);
  resolver.assertActive();
  const capturedAt = new Date().toISOString();
  const cache =
    options.cache === undefined ? publicCitationCache : options.cache;
  if (source.kind === 'doi' || source.kind === 'isbn') {
    const cached = cache
      ? await readCitationCache(source, cache, resolver.remainingMs())
      : null;
    if (cached)
      return captured(
        cached,
        cached.provenance.registry === 'openalex'
          ? 'openalex'
          : source.kind === 'doi'
            ? 'crossref'
            : 'openlibrary',
        'hit',
        resolver
      );
    let work: CiteWork;
    let registry: CapturedSource;
    if (source.kind === 'doi') {
      try {
        const body = await resolver.fetch(
          new URL(
            `https://api.crossref.org/works/${encodeURIComponent(source.value)}`
          ),
          'json'
        );
        work = mapCrossref(body, source.value, capturedAt);
        registry = 'crossref';
      } catch (error) {
        // Only an authoritative miss admits a different registry; failures never retry.
        if (
          !(error instanceof CitationLookupError) ||
          error.code !== 'NOT_FOUND'
        )
          throw error;
        const body = await resolver.fetch(
          openAlexUrl(`/works/doi:${encodeURIComponent(source.value)}`),
          'json'
        );
        const candidate = mapOpenAlex(body, source, capturedAt)[0];
        if (!candidate) throw new CitationLookupError('NOT_FOUND', 404);
        work = candidate;
        registry = 'openalex';
      }
    } else {
      const body = await resolver.fetch(
        new URL(
          `https://openlibrary.org/api/books?bibkeys=ISBN:${source.value}&format=json&jscmd=data`
        ),
        'json'
      );
      work = mapOpenLibrary(body, source.value, capturedAt);
      registry = 'openlibrary';
    }
    if (cache)
      await writeCitationCache(source, work, cache, resolver.remainingMs());
    return captured(work, registry, cache ? 'miss' : 'bypassed', resolver);
  }
  if (source.kind === 'title') {
    const url = openAlexUrl('/works');
    url.searchParams.set('search', source.value);
    url.searchParams.set('per_page', '3');
    const body = await resolver.fetch(url, 'json');
    const candidates = mapOpenAlex(body, source, capturedAt);
    resolver.assertActive();
    return {
      kind: 'candidates',
      candidates,
      source: 'openalex',
      needsReview: true,
      receipt: resolver.receipt(),
    };
  }
  if (source.kind === 'pmid') {
    const body = await resolver.fetch(
      openAlexUrl(`/works/pmid:${source.value}`),
      'json'
    );
    const work = mapOpenAlex(body, source, capturedAt)[0];
    if (!work) throw new CitationLookupError('NOT_FOUND', 404);
    return captured(work, 'openalex', 'bypassed', resolver);
  }
  const url =
    source.kind === 'arxiv'
      ? new URL(`https://arxiv.org/abs/${source.value}`)
      : source.url;
  if (url.protocol !== 'https:' || !WEBPAGE_HOSTS.has(url.hostname)) {
    resolver.assertActive();
    return {
      kind: 'manual',
      source: 'manual',
      needsReview: true,
      receipt: resolver.receipt(),
      fields: {
        type: 'webpage',
        title: '',
        authors: [],
        URL: url.toString(),
        accessed: capturedAt.slice(0, 10),
      },
    };
  }
  const body = await resolver.fetch(url, 'html');
  const parsed = parseHtmlCitation(body, url);
  resolver.assertActive();
  if (!parsed.fields.title)
    return {
      kind: 'manual',
      fields: parsed.fields,
      source: 'manual',
      needsReview: true,
      receipt: resolver.receipt(),
    };
  const work = buildCapturedWork(
    parsed.fields,
    {
      ...parsed.extra,
      ...(source.kind === 'arxiv'
        ? ({
            type: 'journal-article',
            genre: 'preprint',
            arxivId: source.value,
            archive: 'arXiv',
          } satisfies Partial<CiteWork>)
        : {}),
    },
    {
      sourceCaptureMethod: source.kind === 'arxiv' ? 'arxiv' : 'url',
      verificationStatus: 'url_scraped',
      ...(source.kind === 'arxiv' ? { registry: 'arxiv' } : {}),
      capturedAt,
      sourceUrl: url.toString(),
    }
  );
  return captured(
    work,
    source.kind === 'arxiv' ? 'arxiv' : 'webpage',
    'bypassed',
    resolver
  );
}

/** One AI-repair grounding attempt shares a hard budget across every identifier. */
export function createCitationGroundingSession(options: {
  signal: AbortSignal;
  network?: MetadataNetwork;
}) {
  const resolver = createSourceResolver(options.network, options.signal);
  return {
    receipt: resolver.receipt,
    async capture(identifier: string): Promise<CitationCaptureResult> {
      resolver.assertActive();
      const source = recognizeCaptureSource(identifier);
      if (!['doi', 'isbn', 'pmid', 'arxiv'].includes(source.kind))
        throw new CitationLookupError('INVALID_INPUT', 400);
      return captureCitation(identifier, { resolver, cache: null });
    },
  };
}
