import type { CiteContributor, CiteDate, CiteWork } from './model';

export type CslName =
  | { literal: string }
  | {
      family: string;
      given?: string;
      'non-dropping-particle'?: string;
      suffix?: string;
    };
export type CslDate = { 'date-parts': number[][]; circa?: boolean };
const preserveCase = (value: string) =>
  `<span class="nocase">${value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}</span>`;
export type CslItem = {
  id: string;
  type: string;
  title: string;
  author: CslName[];
  editor: CslName[];
  translator: CslName[];
  issued?: CslDate;
  accessed?: CslDate;
  'original-date'?: CslDate;
  'title-short'?: string;
  'container-title'?: string;
  'container-title-short'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  'article-number'?: string;
  edition?: string;
  publisher?: string;
  'publisher-place'?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  URL?: string;
  archive?: string;
  archive_location?: string;
  number?: string;
  genre?: string;
  medium?: string;
  version?: string;
  language?: string;
  note?: string;
  jurisdiction?: string;
  authority?: string;
};

const CSL_TYPES = {
  book: 'book',
  'book-chapter': 'chapter',
  'edited-book': 'book',
  'journal-article': 'article-journal',
  'newspaper-article': 'article-newspaper',
  'magazine-article': 'article-magazine',
  'conference-paper': 'paper-conference',
  webpage: 'webpage',
  'web-document': 'webpage',
  'blog-post': 'post-weblog',
  'social-post': 'post',
  report: 'report',
  dataset: 'dataset',
  thesis: 'thesis',
  standard: 'standard',
  patent: 'patent',
  film: 'motion_picture',
  'tv-episode': 'broadcast',
  podcast: 'broadcast',
  'streaming-video': 'motion_picture',
  'music-recording': 'song',
  'artwork-image': 'graphic',
  'table-figure': 'figure',
  'course-material': 'document',
  interview: 'interview',
  'personal-communication': 'personal_communication',
  'legal-case': 'legal_case',
  legislation: 'legislation',
  treaty: 'treaty',
  'indigenous-knowledge': 'document',
  'ai-generated': 'software',
  software: 'software',
} satisfies Record<CiteWork['type'], string>;

function names(contributors: CiteContributor[]): CslName[] {
  return contributors.map((author) =>
    author.kind === 'organization'
      ? { literal: author.name }
      : {
          family: author.family,
          given:
            [author.given, author.middle].filter(Boolean).join(' ') ||
            undefined,
          'non-dropping-particle': author.particle,
          suffix: author.suffix,
        }
  );
}

function date(value: CiteDate | undefined): CslDate | undefined {
  if (!value || !('year' in value)) return undefined;
  return {
    'date-parts': [
      [
        value.year,
        ...(value.month ? [value.month] : []),
        ...(value.day ? [value.day] : []),
      ],
    ],
    ...(value.circa || value.approximate ? { circa: true } : {}),
  };
}

export function toCslItem(work: CiteWork): CslItem {
  return {
    id: work.id,
    type: CSL_TYPES[work.type],
    title:
      work.type === 'ai-generated' && work.aiGenerated
        ? `${preserveCase(work.aiGenerated.modelName)}${work.aiGenerated.modelName === work.title ? '' : `: ${work.title}`}`
        : work.title,
    author: names(work.authors),
    editor: names(work.editors),
    translator: names(work.translators),
    issued: date(work.issued),
    'original-date': date(work.originalDate),
    accessed: work.accessed
      ? { 'date-parts': [work.accessed.split('-').map(Number)] }
      : undefined,
    'title-short': work.shortTitle,
    'container-title': work.containerTitle,
    'container-title-short': work.containerAbbrev,
    volume: work.volume,
    issue: work.issue,
    page: work.pages,
    'article-number': work.articleNumber,
    edition: work.edition,
    publisher:
      work.publisher ??
      work.aiGenerated?.provider ??
      work.indigenous?.nationOrCommunity,
    'publisher-place': work.publisherPlace ?? work.indigenous?.countryOrPlace,
    DOI: work.doi,
    ISBN: work.isbn,
    ISSN: work.issn,
    URL: work.url ?? work.aiGenerated?.promptShareUrl,
    archive: work.archive,
    archive_location: work.archiveLocation,
    number: work.reportNumber ?? work.patentNumber ?? work.standardNumber,
    genre:
      work.genre ??
      work.medium ??
      (work.type === 'ai-generated'
        ? 'Large language model'
        : work.type === 'dataset'
          ? 'data set'
          : work.type === 'indigenous-knowledge'
            ? 'Indigenous knowledge'
            : undefined),
    medium: work.medium,
    version: work.aiGenerated?.modelVersion,
    language: work.language,
    note: work.indigenous?.protocolNote,
    jurisdiction: work.legal?.jurisdiction,
    authority: work.legal?.court,
  };
}
