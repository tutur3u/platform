import 'server-only';

import { z } from 'zod';
import {
  CitationLookupError,
  fetchMetadataText,
  type MetadataNetwork,
  WEBPAGE_HOSTS,
} from './metadata-network';
import type { CitationFields } from './types';
import { parseHtmlCitation } from './capture-webpage';
import {
  clean,
  parseAuthor,
  validIsbn,
  yearFrom,
  normalizedYear,
  doiFromUrl,
  safeUrl,
} from './metadata-text';

const text = z.string().max(4000);
const crossrefSchema = z.object({
  message: z.object({
    title: z.array(text).optional(),
    author: z
      .array(
        z.object({
          family: text.optional(),
          given: text.optional(),
          name: text.optional(),
        })
      )
      .max(100)
      .optional(),
    published: z
      .object({ 'date-parts': z.array(z.array(z.number())).optional() })
      .optional(),
    publisher: text.optional(),
    'container-title': z.array(text).optional(),
    volume: text.optional(),
    issue: text.optional(),
    page: text.optional(),
    type: text.optional(),
  }),
});
const bookSchema = z.object({
  title: text,
  authors: z
    .array(z.object({ name: text }))
    .max(100)
    .optional(),
  publishers: z.array(z.object({ name: text })).optional(),
  publish_date: text.optional(),
});

export interface CitationLookupResult {
  fields: CitationFields;
  source: 'crossref' | 'openlibrary' | 'webpage' | 'manual';
  needsReview: true;
}

const DOI_PATTERN = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;

async function lookupCrossref(
  identifier: string,
  network: MetadataNetwork | undefined,
  signal: AbortSignal | undefined
): Promise<CitationLookupResult> {
  const response = await fetchMetadataText(
    new URL(`https://api.crossref.org/works/${encodeURIComponent(identifier)}`),
    'json',
    network,
    { signal }
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  }
  const result = crossrefSchema.safeParse(parsed);
  if (!result.success) throw new CitationLookupError('UPSTREAM_ERROR', 502);
  const work = result.data.message;
  return {
    source: 'crossref',
    needsReview: true,
    fields: {
      type:
        work.type === 'book' || work.type === 'monograph'
          ? 'book'
          : 'article-journal',
      title: clean(work.title?.[0]) ?? '',
      authors: (work.author ?? [])
        .map((author) => ({
          family: clean(author.family ?? author.name, 200) ?? '',
          given: clean(author.given, 200),
        }))
        .filter(({ family }) => family.length > 0),
      year: normalizedYear(work.published?.['date-parts']?.[0]?.[0]),
      publisher: clean(work.publisher),
      containerTitle: clean(work['container-title']?.[0]),
      volume: clean(work.volume),
      issue: clean(work.issue),
      pages: clean(work.page),
      DOI: identifier,
      URL: `https://doi.org/${identifier}`,
    },
  };
}

export async function lookupCitation(
  input: string,
  network?: MetadataNetwork,
  signal?: AbortSignal
): Promise<CitationLookupResult> {
  signal?.throwIfAborted();
  const value = input.trim();
  if (!value || value.length > 2048 || /[\u0000-\u001f]/.test(value))
    throw new CitationLookupError('INVALID_INPUT', 400);
  let identifier = value.replace(/^doi:\s*/i, '');
  let url: URL | undefined;
  if (/^https?:\/\//i.test(value)) {
    url = safeUrl(value);
    if (url.hostname === 'doi.org' || url.hostname === 'dx.doi.org') {
      try {
        identifier = decodeURIComponent(url.pathname.slice(1));
      } catch {
        throw new CitationLookupError('INVALID_INPUT', 400);
      }
      if (!DOI_PATTERN.test(identifier)) {
        throw new CitationLookupError('INVALID_INPUT', 400);
      }
    }
  }
  const pathDoi =
    url && url.hostname !== 'doi.org' && url.hostname !== 'dx.doi.org'
      ? doiFromUrl(url)
      : null;
  if (pathDoi) {
    // A publisher link resolves through the registry only; a miss or an
    // upstream failure still leaves the URL as a manual entry.
    try {
      return await lookupCrossref(pathDoi, network, signal);
    } catch (error) {
      if (
        !(error instanceof CitationLookupError) ||
        (error.code !== 'NOT_FOUND' && error.code !== 'UPSTREAM_ERROR')
      )
        throw error;
    }
  }
  if (DOI_PATTERN.test(identifier))
    return lookupCrossref(identifier, network, signal);
  const isbn = value
    .replace(/^ISBN(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  if (validIsbn(isbn)) {
    const response = await fetchMetadataText(
      new URL(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
      ),
      'json',
      network,
      { signal }
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      throw new CitationLookupError('UPSTREAM_ERROR', 502);
    }
    const result = z.record(z.string(), bookSchema).safeParse(parsed);
    if (!result.success) throw new CitationLookupError('UPSTREAM_ERROR', 502);
    const book = result.data[`ISBN:${isbn}`];
    if (!book) throw new CitationLookupError('NOT_FOUND', 404);
    return {
      source: 'openlibrary',
      needsReview: true,
      fields: {
        type: 'book',
        title: clean(book.title) ?? '',
        authors: (book.authors ?? [])
          .map(({ name }) => parseAuthor(clean(name) ?? ''))
          .filter(({ family }) => family.length > 0),
        year: yearFrom(book.publish_date),
        publisher: clean(book.publishers?.[0]?.name),
        ISBN: isbn,
      },
    };
  }
  if (url) {
    if (url.protocol === 'https:' && WEBPAGE_HOSTS.has(url.hostname)) {
      const html = await fetchMetadataText(url, 'html', network, { signal });
      return {
        source: 'webpage',
        needsReview: true,
        fields: parseHtmlCitation(html, url).fields,
      };
    }
    return {
      source: 'manual',
      needsReview: true,
      fields: {
        type: 'webpage',
        title: '',
        authors: [],
        URL: url.toString(),
        accessed: new Date().toISOString().slice(0, 10),
      },
    };
  }
  throw new CitationLookupError('INVALID_INPUT', 400);
}
