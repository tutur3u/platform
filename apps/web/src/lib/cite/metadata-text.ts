import { isIP } from 'node:net';
import { Parser } from 'htmlparser2';
import { CitationLookupError, WEBPAGE_HOSTS } from './metadata-network';

export function clean(value: string | undefined, limit = 1000) {
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

export function parseAuthor(value: string) {
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

export function validIsbn(value: string) {
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

export function yearFrom(value: string | undefined) {
  const match = value?.match(/\b(1[5-9]\d{2}|20\d{2}|2100)\b/);
  return match ? Number(match[0]) : undefined;
}

export function normalizedYear(value: number | undefined) {
  return value !== undefined &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9999
    ? value
    : undefined;
}

export function safeUrl(value: string) {
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
      'api.openalex.org',
      'pubmed.ncbi.nlm.nih.gov',
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
