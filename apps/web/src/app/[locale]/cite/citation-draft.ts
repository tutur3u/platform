import type { CitationLookupFields } from '@tuturuuu/internal-api/cite';
import { type CitationFields, citationFieldsSchema } from '@/lib/cite/types';

export type SourceType = CitationFields['type'];

export const SOURCE_TYPES = [
  'article-journal',
  'book',
  'webpage',
] as const satisfies readonly SourceType[];

export type DraftAuthor = { id: string; family: string; given: string };

/** Editable text values; converted to validated CitationFields on each change. */
export type CitationDraft = {
  type: SourceType;
  title: string;
  authors: DraftAuthor[];
  year: string;
  publisher: string;
  publisherPlace: string;
  containerTitle: string;
  volume: string;
  issue: string;
  pages: string;
  DOI: string;
  URL: string;
  ISBN: string;
  accessed: string;
};

export type DraftTextField = Exclude<keyof CitationDraft, 'type' | 'authors'>;

/** Fields shown and cited for each source type; other values stay in the draft. */
export const FIELDS_BY_TYPE: Record<SourceType, readonly DraftTextField[]> = {
  'article-journal': [
    'title',
    'year',
    'containerTitle',
    'volume',
    'issue',
    'pages',
    'DOI',
    'URL',
  ],
  book: ['title', 'year', 'publisher', 'publisherPlace', 'ISBN', 'DOI', 'URL'],
  webpage: ['title', 'year', 'containerTitle', 'URL', 'accessed'],
};

let authorSequence = 0;

export function newAuthor(family = '', given = ''): DraftAuthor {
  authorSequence += 1;
  return { id: `author-${authorSequence}`, family, given };
}

export function emptyDraft(
  type: SourceType = 'article-journal'
): CitationDraft {
  return {
    type,
    title: '',
    authors: [newAuthor()],
    year: '',
    publisher: '',
    publisherPlace: '',
    containerTitle: '',
    volume: '',
    issue: '',
    pages: '',
    DOI: '',
    URL: '',
    ISBN: '',
    accessed: '',
  };
}

export function draftFromLookup(fields: CitationLookupFields): CitationDraft {
  const draft = emptyDraft(fields.type);
  return {
    ...draft,
    title: fields.title ?? '',
    authors: fields.authors.length
      ? fields.authors.map((author) =>
          newAuthor(author.family, author.given ?? '')
        )
      : draft.authors,
    year: fields.year ? String(fields.year) : '',
    publisher: fields.publisher ?? '',
    containerTitle: fields.containerTitle ?? '',
    volume: fields.volume ?? '',
    issue: fields.issue ?? '',
    pages: fields.pages ?? '',
    DOI: fields.DOI ?? '',
    URL: fields.URL ?? '',
    ISBN: fields.ISBN ?? '',
    accessed: fields.accessed ?? '',
  };
}

export type DraftIssue = DraftTextField | 'authors';

export type DraftResult =
  | { kind: 'incomplete' }
  | { kind: 'invalid'; issues: DraftIssue[] }
  | { kind: 'ready'; fields: CitationFields };

const YEAR_PATTERN = /^\d{1,4}$/;

/**
 * Converts the visible fields for the selected type into CitationFields.
 * Blank author rows are ignored; a row with only a given name is invalid
 * because the family name (or organisation) is what the styles cite.
 */
export function draftToFields(draft: CitationDraft): DraftResult {
  const visible = new Set(FIELDS_BY_TYPE[draft.type]);
  const issues: DraftIssue[] = [];
  const text = (field: DraftTextField) =>
    visible.has(field) ? draft[field].trim() || undefined : undefined;

  const authors = draft.authors
    .map((author) => ({
      family: author.family.trim(),
      given: author.given.trim(),
    }))
    .filter((author) => author.family || author.given);
  if (authors.some((author) => !author.family)) issues.push('authors');

  const yearText = text('year');
  const year = yearText ? Number(yearText) : undefined;
  if (yearText && (!YEAR_PATTERN.test(yearText) || !year)) issues.push('year');

  const title = text('title');
  const candidate = {
    type: draft.type,
    title: title ?? '',
    authors: authors.map(({ family, given }) =>
      given ? { family, given } : { family }
    ),
    year,
    publisher: text('publisher'),
    publisherPlace: text('publisherPlace'),
    containerTitle: text('containerTitle'),
    volume: text('volume'),
    issue: text('issue'),
    pages: text('pages'),
    DOI: text('DOI'),
    URL: text('URL'),
    ISBN: text('ISBN'),
    accessed: text('accessed'),
  };

  const parsed = citationFieldsSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'title') continue;
      const field = (key === 'authors' ? 'authors' : key) as DraftIssue;
      if (!issues.includes(field)) issues.push(field);
    }
  }
  if (issues.length) return { kind: 'invalid', issues };
  if (!title || !parsed.success) return { kind: 'incomplete' };
  return { kind: 'ready', fields: parsed.data };
}

export type LookupErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'RESPONSE_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'LOOKUP_UNAVAILABLE';

const LOOKUP_ERROR_CODES = new Set<string>([
  'INVALID_INPUT',
  'NOT_FOUND',
  'UPSTREAM_ERROR',
  'TIMEOUT',
  'RESPONSE_TOO_LARGE',
  'RATE_LIMITED',
  'LOOKUP_UNAVAILABLE',
]);

const CODE_BY_STATUS: Record<number, LookupErrorCode> = {
  400: 'INVALID_INPUT',
  404: 'NOT_FOUND',
  413: 'RESPONSE_TOO_LARGE',
  415: 'INVALID_INPUT',
  429: 'RATE_LIMITED',
  503: 'LOOKUP_UNAVAILABLE',
  504: 'TIMEOUT',
};

/** Maps a failed lookup to a known code; server text is never shown. */
export function toLookupErrorCode(error: unknown): LookupErrorCode {
  if (error && typeof error === 'object') {
    const { code, message, status } = error as {
      code?: unknown;
      message?: unknown;
      status?: unknown;
    };
    for (const value of [code, message])
      if (typeof value === 'string' && LOOKUP_ERROR_CODES.has(value))
        return value as LookupErrorCode;
    if (typeof status === 'number' && CODE_BY_STATUS[status])
      return CODE_BY_STATUS[status];
  }
  return 'UPSTREAM_ERROR';
}

/** Errors where repeating the same lookup may succeed. */
export function isRetryableLookupError(code: LookupErrorCode) {
  return (
    code === 'UPSTREAM_ERROR' ||
    code === 'TIMEOUT' ||
    code === 'RATE_LIMITED' ||
    code === 'LOOKUP_UNAVAILABLE'
  );
}
