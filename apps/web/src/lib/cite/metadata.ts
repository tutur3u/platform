import 'server-only';

import { isIP } from 'node:net';
import { Parser } from 'htmlparser2';
import { z } from 'zod';
import {
  CitationLookupError,
  fetchMetadataText,
  type MetadataNetwork,
  WEBPAGE_HOSTS,
} from './metadata-network';
import type { CitationFields } from './types';

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

function clean(value: string | undefined, limit = 1000) {
  if (value === undefined) return undefined;
  const text: string[] = [];
  let suppressed = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (name === 'script' || name === 'style') suppressed += 1;
      },
      onclosetag(name) {
        if ((name === 'script' || name === 'style') && suppressed > 0)
          suppressed -= 1;
      },
      ontext(chunk) {
        if (suppressed === 0) text.push(chunk);
      },
    },
    { decodeEntities: false, recognizeCDATA: true }
  );
  parser.end(decodeEntities(value));
  return text.join('').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function parseAuthor(value: string) {
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 400);
  const comma = name.indexOf(',');
  if (comma >= 0)
    return {
      family: name.slice(0, comma).trim().slice(0, 200),
      given: name
        .slice(comma + 1)
        .trim()
        .slice(0, 200),
    };
  const parts = name.split(' ');
  return {
    family: (parts.pop() ?? '').slice(0, 200),
    given: parts.join(' ').slice(0, 200),
  };
}

function validIsbn(value: string) {
  if (/^\d{9}[\dX]$/.test(value)) {
    return (
      value
        .split('')
        .reduce(
          (sum, character, index) =>
            sum + (character === 'X' ? 10 : Number(character)) * (10 - index),
          0
        ) %
        11 ===
      0
    );
  }
  return (
    /^97[89]\d{10}$/.test(value) &&
    value
      .split('')
      .reduce(
        (sum, character, index) =>
          sum + Number(character) * (index % 2 ? 3 : 1),
        0
      ) %
      10 ===
      0
  );
}

function yearFrom(value: string | undefined) {
  const match = value?.match(/\b(1[5-9]\d{2}|20\d{2}|2100)\b/);
  return match ? Number(match[0]) : undefined;
}

function normalizedYear(value: number | undefined) {
  return value !== undefined &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9999
    ? value
    : undefined;
}

function safeUrl(value: string) {
  const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1];
  if (!authority || /[^\x21-\x7e]|[%\\@]/.test(authority)) {
    throw new CitationLookupError('INVALID_INPUT', 400);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CitationLookupError('INVALID_INPUT', 400);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname.endsWith('.') ||
    url.hostname.split('.').some((part) => part.startsWith('xn--')) ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    [
      'api.crossref.org',
      'openlibrary.org',
      'doi.org',
      'dx.doi.org',
      ...WEBPAGE_HOSTS,
    ].some(
      (host) =>
        url.hostname !== host &&
        (url.hostname.startsWith(`${host}.`) ||
          url.hostname.endsWith(`.${host}`))
    )
  ) {
    throw new CitationLookupError('INVALID_INPUT', 400);
  }
  url.hash = '';
  return url;
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (_whole, entity: string) => {
      if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? '';
      const point = entity.toLowerCase().startsWith('#x')
        ? Number.parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
  );
}

function parseWebpage(html: string, url: URL): CitationFields {
  const values = new Map<string, string[]>();
  for (const match of html.matchAll(/<meta\b[^>]{0,8000}>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
    )) {
      if (attribute[1])
        attributes.set(
          attribute[1].toLowerCase(),
          attribute[2] ?? attribute[3] ?? attribute[4] ?? ''
        );
    }
    const key = (
      attributes.get('name') ?? attributes.get('property')
    )?.toLowerCase();
    const content = clean(attributes.get('content'));
    if (key && content) values.set(key, [...(values.get(key) ?? []), content]);
  }
  const first = (key: string) => values.get(key)?.[0];
  const title =
    first('citation_title') ??
    first('og:title') ??
    clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]) ??
    '';
  const journal = first('citation_journal_title');
  const firstPage = first('citation_firstpage');
  const lastPage = first('citation_lastpage');
  return {
    type: journal ? 'article-journal' : 'webpage',
    title,
    authors: (values.get('citation_author') ?? values.get('author') ?? [])
      .slice(0, 100)
      .map(parseAuthor)
      .filter(({ family }) => family.length > 0),
    year: yearFrom(
      first('citation_publication_date') ?? first('article:published_time')
    ),
    containerTitle: journal ?? first('og:site_name'),
    publisher: first('citation_publisher'),
    volume: first('citation_volume'),
    issue: first('citation_issue'),
    pages:
      first('citation_pages') ??
      (firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage),
    DOI: first('citation_doi'),
    URL: url.toString(),
    accessed: new Date().toISOString().slice(0, 10),
  };
}

export async function lookupCitation(
  input: string,
  network?: MetadataNetwork
): Promise<CitationLookupResult> {
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
      if (!/^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(identifier)) {
        throw new CitationLookupError('INVALID_INPUT', 400);
      }
    }
  }
  if (/^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(identifier)) {
    const response = await fetchMetadataText(
      new URL(
        `https://api.crossref.org/works/${encodeURIComponent(identifier)}`
      ),
      'json',
      network
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
      network
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
      const html = await fetchMetadataText(url, 'html', network);
      return {
        source: 'webpage',
        needsReview: true,
        fields: parseWebpage(html, url),
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
