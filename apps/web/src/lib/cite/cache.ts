import 'server-only';

import { createHash } from 'node:crypto';
import { type CiteWork, CiteWorkSchema } from '@tuturuuu/cite';
import { Redis } from '@upstash/redis';
import type { CaptureSource } from './source-resolver';

export const CITATION_CACHE_TTL_SECONDS = 86_400;
const CACHE_WAIT_MS = 150;
const CACHE_MAX_BYTES = 64 * 1024;
type PublicIdentifier = Extract<CaptureSource, { kind: 'doi' | 'isbn' }>;

export interface CitationCache {
  get: (key: string, signal: AbortSignal) => Promise<unknown>;
  set: (
    key: string,
    value: CiteWork,
    ttlSeconds: number,
    signal: AbortSignal
  ) => Promise<unknown>;
}

function client(signal: AbortSignal) {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    return null;
  return Redis.fromEnv({
    retry: { retries: 0 },
    signal,
    enableAutoPipelining: false,
  });
}

export const publicCitationCache: CitationCache = {
  get: async (key, signal) => client(signal)?.get(key) ?? null,
  set: async (key, value, ttlSeconds, signal) =>
    client(signal)?.set(key, value, { ex: ttlSeconds }) ?? null,
};

export function citationCacheKey(source: CaptureSource) {
  if (source.kind !== 'doi' && source.kind !== 'isbn') return null;
  const normalized =
    source.kind === 'doi' ? source.value.toLowerCase() : source.value;
  return `cite:metadata:v1:${source.kind}:${createHash('sha256').update(normalized).digest('hex')}`;
}

async function boundedCache<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  remainingMs: number
): Promise<T | null> {
  const wait = Math.min(CACHE_WAIT_MS, remainingMs);
  if (wait <= 0) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, wait);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function matchesPublicIdentifier(work: CiteWork, source: PublicIdentifier) {
  return (
    (source.kind === 'doi'
      ? work.doi === source.value.toLowerCase()
      : work.isbn === source.value) &&
    work.provenance.verificationStatus === 'verified_registry' &&
    ['crossref', 'openalex', 'openlibrary'].includes(
      work.provenance.registry ?? ''
    )
  );
}

/** Only registry fields enter the shared store, never user edits, prompts or arbitrary URL queries. */
function publicProjection(work: CiteWork, source: PublicIdentifier): CiteWork {
  return CiteWorkSchema.parse({
    id: work.id,
    type: work.type,
    title: work.title,
    authors: work.authors,
    editors: work.editors,
    translators: work.translators,
    issued: work.issued,
    containerTitle: work.containerTitle,
    publisher: work.publisher,
    publisherPlace: work.publisherPlace,
    volume: work.volume,
    issue: work.issue,
    pages: work.pages,
    articleNumber: work.articleNumber,
    genre: work.genre,
    language: work.language,
    pmid: work.pmid,
    edition: work.edition,
    doi: work.doi,
    isbn: work.isbn,
    issn: work.issn,
    url: source.kind === 'doi' ? `https://doi.org/${source.value}` : undefined,
    provenance: {
      sourceCaptureMethod: source.kind,
      verificationStatus: 'verified_registry',
      registry: work.provenance.registry,
      capturedAt: work.provenance.capturedAt,
    },
  });
}

export async function readCitationCache(
  source: CaptureSource,
  cache: CitationCache,
  remainingMs: number
) {
  const key = citationCacheKey(source);
  if (!key || (source.kind !== 'doi' && source.kind !== 'isbn')) return null;
  const value = await boundedCache(
    (signal) => cache.get(key, signal),
    remainingMs
  );
  if (value === null) return null;
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return null;
  }
  if (
    typeof encoded !== 'string' ||
    new TextEncoder().encode(encoded).byteLength > CACHE_MAX_BYTES
  )
    return null;
  const parsed = CiteWorkSchema.safeParse(value);
  if (!parsed.success || !matchesPublicIdentifier(parsed.data, source))
    return null;
  return publicProjection(parsed.data, source);
}

export async function writeCitationCache(
  source: CaptureSource,
  work: CiteWork,
  cache: CitationCache,
  remainingMs: number
) {
  const key = citationCacheKey(source);
  if (
    !key ||
    (source.kind !== 'doi' && source.kind !== 'isbn') ||
    !matchesPublicIdentifier(work, source)
  )
    return;
  const value = publicProjection(work, source);
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength > CACHE_MAX_BYTES
  )
    return;
  await boundedCache(
    (signal) => cache.set(key, value, CITATION_CACHE_TTL_SECONDS, signal),
    remainingMs
  );
}
