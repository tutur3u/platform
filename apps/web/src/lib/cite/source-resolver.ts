import 'server-only';

import {
  CitationLookupError,
  fetchMetadataText,
  METADATA_MAX_BYTES,
  METADATA_TIMEOUT_MS,
  type MetadataNetwork,
} from './metadata-network';
import { doiFromUrl, safeUrl, validIsbn } from './metadata-text';

export type CaptureSource =
  | { kind: 'doi'; value: string }
  | { kind: 'isbn'; value: string }
  | { kind: 'arxiv'; value: string }
  | { kind: 'pmid'; value: string }
  | { kind: 'url'; url: URL }
  | { kind: 'title'; value: string };

const doiPattern = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;
const arxivPattern =
  /^(?:\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v[1-9]\d{0,2})?$/i;
const pmidPattern = /^[1-9]\d{0,8}$/;

export function recognizeCaptureSource(input: string): CaptureSource {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value))
    throw new CitationLookupError('INVALID_INPUT', 400);
  if (/^title:/i.test(value)) {
    const title = value.slice(6).trim();
    if (title.length < 3 || title.length > 300)
      throw new CitationLookupError('INVALID_INPUT', 400);
    return { kind: 'title', value: title };
  }
  const doi = value.replace(/^doi:\s*/i, '');
  if (doiPattern.test(doi)) return { kind: 'doi', value: doi.toLowerCase() };
  const isbn = value
    .replace(/^ISBN(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  if (validIsbn(isbn)) return { kind: 'isbn', value: isbn };
  if (/^arxiv:/i.test(value)) {
    const id = value.slice(6).trim();
    if (arxivPattern.test(id)) return { kind: 'arxiv', value: id };
    throw new CitationLookupError('INVALID_INPUT', 400);
  }
  if (/^pmid:/i.test(value)) {
    const id = value.slice(5).trim();
    if (pmidPattern.test(id)) return { kind: 'pmid', value: id };
    throw new CitationLookupError('INVALID_INPUT', 400);
  }
  if (/^https?:\/\//i.test(value)) {
    const url = safeUrl(value);
    if (url.hostname === 'doi.org' || url.hostname === 'dx.doi.org') {
      let id: string;
      try {
        id = decodeURIComponent(url.pathname.slice(1));
      } catch {
        throw new CitationLookupError('INVALID_INPUT', 400);
      }
      if (!doiPattern.test(id))
        throw new CitationLookupError('INVALID_INPUT', 400);
      return { kind: 'doi', value: id.toLowerCase() };
    }
    if (url.hostname === 'arxiv.org') {
      const id = url.pathname
        .replace(/^\/(?:abs|html|pdf)\//, '')
        .replace(/\.pdf$/, '');
      if (arxivPattern.test(id)) return { kind: 'arxiv', value: id };
    }
    if (url.hostname === 'pubmed.ncbi.nlm.nih.gov') {
      const id = url.pathname.replace(/^\/|\/$/g, '');
      if (!pmidPattern.test(id))
        throw new CitationLookupError('INVALID_INPUT', 400);
      return { kind: 'pmid', value: id };
    }
    const publisherDoi = doiFromUrl(url);
    if (publisherDoi) return { kind: 'doi', value: publisherDoi.toLowerCase() };
    return { kind: 'url', url };
  }
  throw new CitationLookupError('INVALID_INPUT', 400);
}

export interface SourceResolver {
  fetch: (url: URL, kind: 'json' | 'html') => Promise<string>;
  assertActive: () => void;
  remainingMs: () => number;
  receipt: () => { operations: number; elapsedMs: number };
}

/** Cache waits and all source reads consume the same wall-clock budget. */
export function createSourceResolver(
  network?: MetadataNetwork,
  signal?: AbortSignal
): SourceResolver {
  const startedAt = Date.now();
  const deadline =
    startedAt +
    Math.min(network?.timeoutMs ?? METADATA_TIMEOUT_MS, METADATA_TIMEOUT_MS);
  let operations = 0;
  let admitted = 0;
  let bytes = 0;
  let terminalError: unknown;
  let previous: Promise<void> = Promise.resolve();
  const assertActive = () => {
    if (signal?.aborted)
      throw new DOMException('Citation lookup aborted', 'AbortError');
    if (terminalError !== undefined) throw terminalError;
    if (Date.now() >= deadline) throw new CitationLookupError('TIMEOUT', 504);
  };
  return {
    assertActive,
    remainingMs: () => Math.max(0, deadline - Date.now()),
    receipt: () => ({ operations, elapsedMs: Date.now() - startedAt }),
    async fetch(url, kind) {
      assertActive();
      if (admitted >= 2) throw new CitationLookupError('UPSTREAM_ERROR', 502);
      admitted += 1;
      const read = previous.then(async () => {
        assertActive();
        operations += 1;
        let value: string;
        try {
          value = await fetchMetadataText(url, kind, network, {
            deadline,
            signal,
            maxBytes: METADATA_MAX_BYTES - bytes,
          });
        } catch (error) {
          // Only a header-only 404 permits a fallback. A failed body may have
          // consumed bytes that cannot be refunded to another identifier.
          if (
            !(
              error instanceof CitationLookupError && error.code === 'NOT_FOUND'
            )
          )
            terminalError = error;
          throw error;
        }
        bytes += new TextEncoder().encode(value).byteLength;
        assertActive();
        return value;
      });
      previous = read.then(
        () => undefined,
        () => undefined
      );
      return read;
    },
  };
}
