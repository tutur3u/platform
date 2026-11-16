import 'server-only';

import { createHash } from 'node:crypto';
import {
  type CiteContributor,
  type CiteWork,
  CiteWorkSchema,
  citeDateSchema,
  fromLegacyCitationFields,
  isValidIsbn,
} from '@tuturuuu/cite';
import { z } from 'zod';
import { CitationLookupError } from './metadata-network';
import { clean, normalizedYear, parseAuthor, yearFrom } from './metadata-text';
import type { CaptureSource } from './source-resolver';
import type { CitationFields } from './types';

const text = z.string().max(4000);
const date = z.object({
  'date-parts': z.array(z.array(z.number()).max(3)).max(2).optional(),
});
const contributor = z.object({
  family: text.optional(),
  given: text.optional(),
  name: text.optional(),
  suffix: text.optional(),
  ORCID: text.optional(),
});
const crossrefSchema = z.object({
  message: z.object({
    title: z.array(text).max(10).optional(),
    author: z.array(contributor).max(100).optional(),
    editor: z.array(contributor).max(100).optional(),
    translator: z.array(contributor).max(100).optional(),
    published: date.optional(),
    'published-print': date.optional(),
    'published-online': date.optional(),
    issued: date.optional(),
    publisher: text.optional(),
    'publisher-location': text.optional(),
    'container-title': z.array(text).max(10).optional(),
    volume: text.optional(),
    issue: text.optional(),
    page: text.optional(),
    'article-number': text.optional(),
    'edition-number': z.union([text, z.number()]).optional(),
    type: text.optional(),
    DOI: text.optional(),
    ISBN: z.array(text).max(10).optional(),
    ISSN: z.array(text).max(10).optional(),
    language: text.optional(),
    abstract: z.string().max(20_000).optional(),
  }),
});

const crossrefTypes: Record<string, CiteWork['type']> = {
  book: 'book',
  monograph: 'book',
  'edited-book': 'edited-book',
  'reference-book': 'book',
  'book-chapter': 'book-chapter',
  'book-section': 'book-chapter',
  'reference-entry': 'book-chapter',
  'journal-article': 'journal-article',
  'proceedings-article': 'conference-paper',
  'posted-content': 'journal-article',
  report: 'report',
  'report-series': 'report',
  dataset: 'dataset',
  dissertation: 'thesis',
  standard: 'standard',
};

export function parseProviderJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  }
}

export function buildCapturedWork(
  fields: CitationFields,
  extra: Partial<CiteWork>,
  provenance: CiteWork['provenance']
) {
  const id = `cite:${createHash('sha256')
    .update(
      fields.DOI?.toLowerCase() ?? fields.ISBN ?? fields.URL ?? fields.title
    )
    .digest('hex')}`;
  try {
    const base = fromLegacyCitationFields(fields, { id, provenance });
    return CiteWorkSchema.parse({
      ...base,
      ...Object.fromEntries(
        Object.entries(extra).filter(([, value]) => value !== undefined)
      ),
    });
  } catch {
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  }
}

function crossrefContributors(
  authors: z.infer<typeof contributor>[] = []
): CiteContributor[] {
  return authors.flatMap((author): CiteContributor[] => {
    if (author.name && !author.family) {
      const name = clean(author.name);
      return name ? [{ kind: 'organization', name }] : [];
    }
    const family = clean(author.family, 200);
    if (!family) return [];
    const given = clean(author.given, 200);
    const suffix = clean(author.suffix, 200);
    const orcid = author.ORCID?.replace(/^https:\/\/orcid\.org\//, '');
    return [
      {
        kind: 'person',
        family,
        ...(given ? { given } : {}),
        ...(suffix ? { suffix } : {}),
        ...(orcid && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)
          ? { orcid }
          : {}),
      },
    ];
  });
}

export function mapCrossref(
  body: string,
  doi: string,
  capturedAt: string
): CiteWork {
  const parsed = crossrefSchema.safeParse(parseProviderJson(body));
  if (!parsed.success) throw new CitationLookupError('UPSTREAM_ERROR', 502);
  const work = parsed.data.message;
  if (work.DOI && work.DOI.toLowerCase() !== doi.toLowerCase())
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  const parts = (work.published ??
    work['published-print'] ??
    work['published-online'] ??
    work.issued)?.['date-parts']?.[0];
  const issued = citeDateSchema.safeParse({
    year: parts?.[0],
    month: parts?.[1],
    day: parts?.[2],
  });
  const authors = crossrefContributors(work.author);
  const fields: CitationFields = {
    type:
      work.type &&
      [
        'book',
        'monograph',
        'edited-book',
        'reference-book',
        'book-chapter',
        'book-section',
      ].includes(work.type)
        ? 'book'
        : 'article-journal',
    title: clean(work.title?.[0]) ?? '',
    authors: authors.map((author) =>
      author.kind === 'organization'
        ? { family: author.name.slice(0, 200) }
        : { family: author.family, given: author.given }
    ),
    year: normalizedYear(parts?.[0]),
    publisher: clean(work.publisher),
    publisherPlace: clean(work['publisher-location']),
    containerTitle: clean(work['container-title']?.[0]),
    volume: clean(work.volume, 200),
    issue: clean(work.issue, 200),
    pages: clean(work.page, 200),
    DOI: doi,
    URL: `https://doi.org/${doi}`,
  };
  return buildCapturedWork(
    fields,
    {
      type: crossrefTypes[work.type ?? ''] ?? 'journal-article',
      authors,
      editors: crossrefContributors(work.editor),
      translators: crossrefContributors(work.translator),
      issued: issued.success
        ? issued.data
        : fields.year
          ? { year: fields.year }
          : undefined,
      edition: clean(work['edition-number']?.toString(), 200) || undefined,
      articleNumber: clean(work['article-number'], 200) || undefined,
      isbn: work.ISBN?.find(isValidIsbn),
      issn: work.ISSN?.find((value) => /^\d{4}-\d{3}[\dX]$/.test(value)),
      language: clean(work.language, 200) || undefined,
      genre: work.type === 'posted-content' ? 'preprint' : undefined,
      abstract: clean(work.abstract, 20_000) || undefined,
    },
    {
      sourceCaptureMethod: 'doi',
      verificationStatus:
        work.DOI?.toLowerCase() === doi.toLowerCase()
          ? 'verified_registry'
          : 'manual',
      registry: 'crossref',
      capturedAt,
    }
  );
}

const bookSchema = z.object({
  title: text,
  subtitle: text.optional(),
  authors: z
    .array(z.object({ name: text }))
    .max(100)
    .optional(),
  publishers: z
    .array(z.object({ name: text }))
    .max(10)
    .optional(),
  publish_places: z
    .array(z.object({ name: text }))
    .max(10)
    .optional(),
  publish_date: text.optional(),
  pagination: text.optional(),
  edition_name: text.optional(),
});

export function mapOpenLibrary(
  body: string,
  isbn: string,
  capturedAt: string
): CiteWork {
  const parsed = z
    .record(z.string(), bookSchema)
    .safeParse(parseProviderJson(body));
  if (!parsed.success) throw new CitationLookupError('UPSTREAM_ERROR', 502);
  const book = parsed.data[`ISBN:${isbn}`];
  if (!book) throw new CitationLookupError('NOT_FOUND', 404);
  return buildCapturedWork(
    {
      type: 'book',
      title:
        clean(book.subtitle ? `${book.title}: ${book.subtitle}` : book.title) ??
        '',
      authors: (book.authors ?? [])
        .map(({ name }) => parseAuthor(clean(name) ?? ''))
        .filter(({ family }) => family),
      year: yearFrom(book.publish_date),
      publisher: clean(book.publishers?.[0]?.name),
      publisherPlace: clean(book.publish_places?.[0]?.name),
      ISBN: isbn,
    },
    { edition: clean(book.edition_name, 200) || undefined },
    {
      sourceCaptureMethod: 'isbn',
      verificationStatus: 'verified_registry',
      registry: 'openlibrary',
      capturedAt,
    }
  );
}

const location = z.object({
  source: z
    .object({
      display_name: text.nullish(),
      host_organization_name: text.nullish(),
    })
    .nullish(),
});
const openalexWorkSchema = z.object({
  id: text,
  title: text.nullish(),
  doi: text.nullish(),
  publication_year: z.number().nullish(),
  publication_date: text.nullish(),
  type: text.nullish(),
  authorships: z
    .array(
      z.object({
        author: z.object({ display_name: text, orcid: text.nullish() }),
      })
    )
    .max(100)
    .optional(),
  primary_location: location.nullish(),
  biblio: z
    .object({
      volume: text.nullish(),
      issue: text.nullish(),
      first_page: text.nullish(),
      last_page: text.nullish(),
    })
    .optional(),
  ids: z.object({ pmid: text.nullish() }).optional(),
  language: text.nullish(),
});
export const OPENALEX_SELECT =
  'id,doi,title,publication_year,publication_date,type,authorships,primary_location,ids,biblio,language';

function mapOpenAlexRecord(
  work: z.infer<typeof openalexWorkSchema>,
  source: Extract<CaptureSource, { kind: 'doi' | 'pmid' | 'title' }>,
  capturedAt: string
): CiteWork {
  const doi = work.doi?.replace(/^https:\/\/doi\.org\//, '').toLowerCase();
  const validDoi =
    doi && /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(doi) ? doi : undefined;
  if (source.kind === 'doi' && validDoi !== source.value)
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  const pmid = work.ids?.pmid?.match(
    /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/([1-9]\d{0,8})\/?$/
  )?.[1];
  if (source.kind === 'pmid' && pmid !== source.value)
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  const firstPage = clean(work.biblio?.first_page ?? undefined, 200);
  const lastPage = clean(work.biblio?.last_page ?? undefined, 200);
  const dateParts = work.publication_date?.split('-').map(Number);
  const issued = citeDateSchema.safeParse({
    year: dateParts?.[0],
    month: dateParts?.[1],
    day: dateParts?.[2],
  });
  const fields: CitationFields = {
    type:
      work.type === 'book' || work.type === 'book-chapter'
        ? 'book'
        : 'article-journal',
    title: clean(work.title ?? undefined) ?? '',
    authors: (work.authorships ?? [])
      .map(({ author }) => parseAuthor(clean(author.display_name) ?? ''))
      .filter(({ family }) => family),
    year: normalizedYear(work.publication_year ?? undefined),
    containerTitle: clean(
      work.primary_location?.source?.display_name ?? undefined
    ),
    publisher: clean(
      work.primary_location?.source?.host_organization_name ?? undefined
    ),
    volume: clean(work.biblio?.volume ?? undefined, 200),
    issue: clean(work.biblio?.issue ?? undefined, 200),
    pages:
      firstPage && lastPage
        ? `${firstPage}-${lastPage}`.slice(0, 200)
        : firstPage,
    DOI: validDoi,
    URL: validDoi
      ? `https://doi.org/${validDoi}`
      : /^https:\/\/openalex\.org\/W\d+$/.test(work.id)
        ? work.id
        : undefined,
  };
  return buildCapturedWork(
    fields,
    {
      type:
        crossrefTypes[work.type ?? ''] ??
        (work.type === 'article' ||
        work.type === 'preprint' ||
        work.type === 'review'
          ? 'journal-article'
          : 'web-document'),
      issued: issued.success
        ? issued.data
        : fields.year
          ? { year: fields.year }
          : undefined,
      pmid,
      language: clean(work.language ?? undefined, 200) || undefined,
      genre: work.type === 'preprint' ? 'preprint' : undefined,
    },
    {
      sourceCaptureMethod: source.kind,
      verificationStatus: 'verified_registry',
      registry: 'openalex',
      capturedAt,
    }
  );
}

export function mapOpenAlex(
  body: string,
  source: Extract<CaptureSource, { kind: 'doi' | 'pmid' | 'title' }>,
  capturedAt: string
): CiteWork[] {
  const json = parseProviderJson(body);
  if (source.kind === 'title') {
    const result = z
      .object({ results: z.array(openalexWorkSchema).max(3) })
      .safeParse(json);
    if (!result.success) throw new CitationLookupError('UPSTREAM_ERROR', 502);
    return result.data.results.flatMap((work) => {
      try {
        return [mapOpenAlexRecord(work, source, capturedAt)];
      } catch (error) {
        if (error instanceof CitationLookupError) return [];
        throw error;
      }
    });
  }
  const result = openalexWorkSchema.safeParse(json);
  if (!result.success) throw new CitationLookupError('UPSTREAM_ERROR', 502);
  return [mapOpenAlexRecord(result.data, source, capturedAt)];
}
