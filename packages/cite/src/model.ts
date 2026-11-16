import { z } from 'zod';

export const CITE_WORK_TYPES = [
  'book',
  'book-chapter',
  'edited-book',
  'journal-article',
  'newspaper-article',
  'magazine-article',
  'conference-paper',
  'webpage',
  'web-document',
  'blog-post',
  'social-post',
  'report',
  'dataset',
  'thesis',
  'standard',
  'patent',
  'film',
  'tv-episode',
  'podcast',
  'streaming-video',
  'music-recording',
  'artwork-image',
  'table-figure',
  'course-material',
  'interview',
  'personal-communication',
  'legal-case',
  'legislation',
  'treaty',
  'indigenous-knowledge',
  'ai-generated',
  'software',
] as const;

const text = z.string().trim().min(1).max(2000);
const shortText = z.string().trim().min(1).max(200);
const webUrl = z
  .url()
  .max(4000)
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, 'An HTTP or HTTPS source URL without credentials is required');

export const contributorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('person'),
    family: shortText,
    given: shortText.optional(),
    middle: shortText.optional(),
    particle: shortText.optional(),
    suffix: shortText.optional(),
    orcid: z
      .string()
      .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
      .optional(),
  }),
  z.object({
    kind: z.literal('organization'),
    name: text,
    acronym: shortText.optional(),
  }),
]);
export type CiteContributor = z.infer<typeof contributorSchema>;

export const citeDateSchema = z.union([
  z.object({ nd: z.literal(true) }).strict(),
  z
    .object({
      year: z.number().int().min(1).max(9999),
      month: z.number().int().min(1).max(12).optional(),
      day: z.number().int().min(1).max(31).optional(),
      approximate: z.boolean().optional(),
      circa: z.boolean().optional(),
      season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
    })
    .strict()
    .superRefine((date, context) => {
      if (date.day !== undefined && date.month === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['day'],
          message: 'A day requires a month',
        });
      }
      if (date.month !== undefined && date.day !== undefined) {
        const days = [
          31,
          date.year % 4 === 0 &&
          (date.year % 100 !== 0 || date.year % 400 === 0)
            ? 29
            : 28,
          31,
          30,
          31,
          30,
          31,
          31,
          30,
          31,
          30,
          31,
        ];
        if (date.day > (days[date.month - 1] ?? 0))
          context.addIssue({
            code: 'custom',
            path: ['day'],
            message: 'Invalid calendar date',
          });
      }
    }),
]);
export type CiteDate = z.infer<typeof citeDateSchema>;

export const provenanceSchema = z.object({
  sourceCaptureMethod: z.enum([
    'doi',
    'isbn',
    'url',
    'pdf',
    'bibtex',
    'ris',
    'manual',
    'ai_parsed',
    'arxiv',
    'pmid',
    'title',
  ]),
  verificationStatus: z.enum([
    'verified_registry',
    'url_scraped',
    'manual',
    'ai_inferred',
  ]),
  registry: z
    .enum(['crossref', 'openalex', 'openlibrary', 'arxiv', 'pubmed'])
    .optional(),
  capturedAt: z.iso.datetime().optional(),
  sourceUrl: webUrl.optional(),
});

export function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
}

export function normalizeIsbn(value: string): string {
  return value
    .replace(/^ISBN(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

export function isValidIsbn(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(isbn))
    return (
      [...isbn].reduce(
        (sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i),
        0
      ) %
        11 ===
      0
    );
  return (
    /^97[89]\d{10}$/.test(isbn) &&
    [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) %
      10 ===
      0
  );
}

export const CiteWorkSchema = z.object({
  id: z.string().trim().min(1).max(256),
  type: z.enum(CITE_WORK_TYPES),
  title: text,
  shortTitle: text.optional(),
  authors: z.array(contributorSchema).max(100).default([]),
  editors: z.array(contributorSchema).max(100).default([]),
  translators: z.array(contributorSchema).max(100).default([]),
  issued: citeDateSchema.optional(),
  originalDate: citeDateSchema.optional(),
  accessed: z.iso.date().optional(),
  containerTitle: text.optional(),
  containerAbbrev: shortText.optional(),
  volume: shortText.optional(),
  issue: shortText.optional(),
  pages: shortText.optional(),
  articleNumber: shortText.optional(),
  edition: shortText.optional(),
  publisher: text.optional(),
  publisherPlace: text.optional(),
  doi: z
    .string()
    .max(4000)
    .transform(normalizeDoi)
    .pipe(
      z
        .string()
        .max(2000)
        .regex(/^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i)
    )
    .optional(),
  isbn: z
    .string()
    .max(2000)
    .transform(normalizeIsbn)
    .refine(isValidIsbn, 'Invalid ISBN checksum')
    .optional(),
  issn: z
    .string()
    .regex(/^\d{4}-\d{3}[\dX]$/)
    .optional(),
  arxivId: z
    .string()
    .regex(/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i)
    .optional(),
  pmid: z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .optional(),
  url: webUrl.optional(),
  archive: text.optional(),
  archiveLocation: text.optional(),
  reportNumber: shortText.optional(),
  patentNumber: shortText.optional(),
  standardNumber: shortText.optional(),
  medium: text.optional(),
  genre: text.optional(),
  abstract: z.string().max(20_000).optional(),
  language: shortText.optional(),
  legal: z
    .object({
      court: text.optional(),
      neutralCitation: text.optional(),
      reportSeries: text.optional(),
      jurisdiction: text.optional(),
      legislationYear: z.number().int().min(1).max(9999).optional(),
    })
    .optional(),
  aiGenerated: z
    .object({
      modelName: text,
      modelVersion: shortText.optional(),
      provider: text.optional(),
      promptShareUrl: webUrl.optional(),
      appendixRef: text.optional(),
    })
    .optional(),
  indigenous: z
    .object({
      nationOrCommunity: text.optional(),
      elderOrKnowledgeHolder: text.optional(),
      languageGroup: text.optional(),
      countryOrPlace: text.optional(),
      protocolNote: text.optional(),
    })
    .optional(),
  provenance: provenanceSchema.default({
    sourceCaptureMethod: 'manual',
    verificationStatus: 'manual',
  }),
});
export type CiteWork = z.infer<typeof CiteWorkSchema>;
export type CiteWorkInput = z.input<typeof CiteWorkSchema>;
export type CitationStyle = 'apa' | 'harvard';

export function issuedYear(work: Pick<CiteWork, 'issued'>): number | undefined {
  return work.issued && 'year' in work.issued ? work.issued.year : undefined;
}

export function normalizeCitationStyle(
  style: CitationStyle | 'apa-7' | 'rmit-harvard'
): CitationStyle {
  return style === 'apa-7'
    ? 'apa'
    : style === 'rmit-harvard'
      ? 'harvard'
      : style;
}
