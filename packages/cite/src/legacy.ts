import { z } from 'zod';
import { type CiteWork, CiteWorkSchema, issuedYear } from './model';

const optionalText = z.string().trim().max(2000).optional();
export const citationFieldsSchema = z.object({
  type: z.enum(['book', 'article-journal', 'webpage']),
  title: z.string().trim().min(1).max(2000),
  authors: z
    .array(
      z.object({
        family: z.string().trim().min(1).max(200),
        given: z.string().trim().max(200).optional(),
      })
    )
    .max(100),
  year: z.number().int().min(1).max(9999).optional(),
  publisher: optionalText,
  publisherPlace: optionalText,
  containerTitle: optionalText,
  volume: optionalText,
  issue: optionalText,
  pages: optionalText,
  DOI: optionalText,
  URL: optionalText,
  ISBN: optionalText,
  accessed: z.iso.date().optional(),
});
export type CitationFields = z.infer<typeof citationFieldsSchema>;
export type FormattedCitation = { reference: string; inText: string };

function legacyId(fields: CitationFields): string {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(JSON.stringify(fields)))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  return `legacy:${hash.toString(16).padStart(16, '0')}`;
}

export function fromLegacyCitationFields(
  fields: CitationFields,
  options: { id?: string; provenance?: CiteWork['provenance'] } = {}
): CiteWork {
  const source = citationFieldsSchema.parse(fields);
  return CiteWorkSchema.parse({
    id: options.id ?? legacyId(source),
    type: source.type === 'article-journal' ? 'journal-article' : source.type,
    title: source.title,
    authors: source.authors.map(({ family, given }) => ({
      kind: 'person',
      family,
      ...(given ? { given } : {}),
    })),
    issued: source.year ? { year: source.year } : undefined,
    publisher: source.publisher || undefined,
    publisherPlace: source.publisherPlace || undefined,
    containerTitle: source.containerTitle || undefined,
    volume: source.volume || undefined,
    issue: source.issue || undefined,
    pages: source.pages || undefined,
    doi: source.DOI || undefined,
    isbn: source.ISBN || undefined,
    url: source.URL || undefined,
    accessed: source.accessed,
    provenance: options.provenance,
  });
}

export function toLegacyCitationFields(work: CiteWork): CitationFields {
  return {
    type: ['book', 'edited-book', 'book-chapter'].includes(work.type)
      ? 'book'
      : [
            'journal-article',
            'newspaper-article',
            'magazine-article',
            'conference-paper',
          ].includes(work.type)
        ? 'article-journal'
        : 'webpage',
    title: work.title,
    authors: work.authors.map((author) =>
      author.kind === 'organization'
        ? { family: author.name.slice(0, 200) }
        : {
            family: author.family,
            ...(author.given ? { given: author.given } : {}),
          }
    ),
    year: issuedYear(work),
    publisher: work.publisher,
    publisherPlace: work.publisherPlace,
    containerTitle: work.containerTitle,
    volume: work.volume,
    issue: work.issue,
    pages: work.pages,
    DOI: work.doi,
    ISBN: work.isbn,
    URL: work.url && work.url.length <= 2000 ? work.url : undefined,
    accessed: work.accessed,
  };
}
