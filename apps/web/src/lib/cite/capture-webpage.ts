import 'server-only';

import {
  type CiteContributor,
  type CiteWork,
  citeDateSchema,
} from '@tuturuuu/cite';
import { Parser } from 'htmlparser2';
import { z } from 'zod';
import { clean, parseAuthor, yearFrom } from './metadata-text';
import type { CitationFields } from './types';

const text = z.string().max(4000);
const person = z.union([
  text,
  z.object({
    '@type': text.optional(),
    name: text.optional(),
    familyName: text.optional(),
    givenName: text.optional(),
  }),
]);
const named = z.union([text, z.object({ name: text.optional() })]);
const linkedData = z.object({
  '@type': z.union([text, z.array(text).max(10)]).optional(),
  name: text.optional(),
  headline: text.optional(),
  author: z.union([person, z.array(person).max(100)]).optional(),
  editor: z.union([person, z.array(person).max(100)]).optional(),
  publisher: named.optional(),
  isPartOf: named.optional(),
  datePublished: text.optional(),
  dateCreated: text.optional(),
  pagination: text.optional(),
  pageStart: z.union([text, z.number()]).optional(),
  pageEnd: z.union([text, z.number()]).optional(),
  volumeNumber: z.union([text, z.number()]).optional(),
  issueNumber: z.union([text, z.number()]).optional(),
  isbn: text.optional(),
  doi: text.optional(),
  inLanguage: text.optional(),
});

const jsonTypes: Record<string, CiteWork['type']> = {
  Book: 'book',
  Chapter: 'book-chapter',
  ScholarlyArticle: 'journal-article',
  Article: 'journal-article',
  NewsArticle: 'newspaper-article',
  BlogPosting: 'blog-post',
  Dataset: 'dataset',
  Report: 'report',
  Thesis: 'thesis',
  WebPage: 'webpage',
  SoftwareApplication: 'software',
};

function contributors(
  value: z.infer<typeof linkedData>['author']
): CiteContributor[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).flatMap(
    (entry): CiteContributor[] => {
      if (typeof entry !== 'string' && entry['@type'] === 'Organization') {
        const name = clean(entry.name);
        return name ? [{ kind: 'organization', name }] : [];
      }
      const parsed =
        typeof entry === 'string'
          ? parseAuthor(clean(entry) ?? '')
          : entry.familyName
            ? {
                family: clean(entry.familyName, 200) ?? '',
                given: clean(entry.givenName, 200),
              }
            : parseAuthor(clean(entry.name) ?? '');
      return parsed.family
        ? [
            {
              kind: 'person',
              family: parsed.family,
              ...(parsed.given ? { given: parsed.given } : {}),
            },
          ]
        : [];
    }
  );
}

function firstLinkedData(scripts: string[]) {
  for (const script of scripts) {
    let value: unknown;
    try {
      value = JSON.parse(script);
    } catch {
      continue;
    }
    const pending: unknown[] = [value];
    for (let visited = 0; visited < 40 && pending.length; visited += 1) {
      const next = pending.shift();
      if (Array.isArray(next)) {
        pending.push(...next.slice(0, 40 - visited));
        continue;
      }
      const graph = z
        .object({ '@graph': z.array(z.unknown()).max(40) })
        .safeParse(next);
      if (graph.success)
        pending.push(...graph.data['@graph'].slice(0, 40 - visited));
      const parsed = linkedData.safeParse(next);
      if (!parsed.success) continue;
      const types = parsed.data['@type'];
      const supported = (Array.isArray(types) ? types : [types]).find(
        (type) => type !== undefined && jsonTypes[type] !== undefined
      );
      if (supported && (parsed.data.headline || parsed.data.name))
        return { value: parsed.data, type: jsonTypes[supported] };
    }
  }
  return undefined;
}

export function parseHtmlCitation(
  html: string,
  url: URL
): { fields: CitationFields; extra: Partial<CiteWork> } {
  const values = new Map<string, string[]>();
  const titles: string[] = [];
  const scripts: string[] = [];
  let titleDepth = 0;
  let scriptText: string | null = null;
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'title') titleDepth += 1;
        if (
          name === 'script' &&
          attributes.type?.split(';')[0]?.trim().toLowerCase() ===
            'application/ld+json' &&
          scripts.length < 8
        )
          scriptText = '';
        if (name !== 'meta') return;
        const key = (attributes.name ?? attributes.property)?.toLowerCase();
        const content = clean(attributes.content);
        if (key && content && (values.get(key)?.length ?? 0) < 100)
          values.set(key, [...(values.get(key) ?? []), content]);
      },
      ontext(text) {
        if (titleDepth > 0) titles.push(text);
        if (scriptText !== null && scriptText.length <= 32_768)
          scriptText += text;
      },
      onclosetag(name) {
        if (name === 'title') titleDepth = Math.max(0, titleDepth - 1);
        if (name === 'script' && scriptText !== null) {
          if (scriptText.length <= 32_768) scripts.push(scriptText);
          scriptText = null;
        }
      },
    },
    { decodeEntities: false }
  );
  parser.end(html);
  const ld = firstLinkedData(scripts);
  const first = (...keys: string[]) =>
    keys.map((key) => values.get(key)?.[0]).find(Boolean);
  const all = (...keys: string[]) =>
    keys.map((key) => values.get(key)).find((value) => value?.length);
  const journal = first('citation_journal_title');
  const title =
    first('citation_title') ??
    clean(ld?.value.headline ?? ld?.value.name) ??
    first('dc.title', 'dcterms.title', 'og:title') ??
    clean(titles.join('')) ??
    '';
  const metaAuthors = all(
    'citation_author',
    'dc.creator',
    'dcterms.creator',
    'author'
  );
  const authors = metaAuthors
    ? metaAuthors
        .map(parseAuthor)
        .filter(({ family }) => family.length > 0)
        .map(({ family, given }): CiteContributor => ({
          kind: 'person',
          family,
          ...(given ? { given } : {}),
        }))
    : contributors(ld?.value.author);
  const publisher = ld?.value.publisher;
  const container = ld?.value.isPartOf;
  const firstPage =
    first('citation_firstpage')?.slice(0, 200) ??
    clean(ld?.value.pageStart?.toString(), 200);
  const lastPage =
    first('citation_lastpage')?.slice(0, 200) ??
    clean(ld?.value.pageEnd?.toString(), 200);
  const rawDate =
    first(
      'citation_publication_date',
      'dcterms.issued',
      'dc.date',
      'article:published_time'
    ) ??
    ld?.value.datePublished ??
    ld?.value.dateCreated;
  const dateParts = rawDate?.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  const issued = citeDateSchema.safeParse({
    year: dateParts ? Number(dateParts[1]) : yearFrom(rawDate),
    month: dateParts ? Number(dateParts[2]) : undefined,
    day: dateParts?.[3] ? Number(dateParts[3]) : undefined,
  });
  const dcTypes: Record<string, CiteWork['type']> = {
    dataset: 'dataset',
    report: 'report',
    article: 'journal-article',
    book: 'book',
    thesis: 'thesis',
    software: 'software',
  };
  const dcType = dcTypes[first('dc.type', 'dcterms.type')?.toLowerCase() ?? ''];
  const fields: CitationFields = {
    type:
      journal || ld?.type === 'journal-article'
        ? 'article-journal'
        : ld?.type === 'book' || ld?.type === 'book-chapter'
          ? 'book'
          : 'webpage',
    title,
    authors: authors.map((author) =>
      author.kind === 'organization'
        ? { family: author.name.slice(0, 200) }
        : { family: author.family, given: author.given }
    ),
    year: yearFrom(
      first(
        'citation_publication_date',
        'dc.date',
        'dcterms.issued',
        'article:published_time'
      ) ??
        ld?.value.datePublished ??
        ld?.value.dateCreated
    ),
    containerTitle:
      journal ??
      clean(typeof container === 'string' ? container : container?.name) ??
      first('og:site_name'),
    publisher:
      first('citation_publisher', 'dc.publisher', 'dcterms.publisher') ??
      clean(typeof publisher === 'string' ? publisher : publisher?.name),
    volume:
      first('citation_volume')?.slice(0, 200) ??
      clean(ld?.value.volumeNumber?.toString(), 200),
    issue:
      first('citation_issue')?.slice(0, 200) ??
      clean(ld?.value.issueNumber?.toString(), 200),
    pages: (
      first('citation_pages') ??
      clean(ld?.value.pagination, 200) ??
      (firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage)
    )?.slice(0, 200),
    DOI: first('citation_doi', 'dc.identifier.doi') ?? clean(ld?.value.doi),
    ISBN: first('citation_isbn') ?? clean(ld?.value.isbn),
    URL: url.toString(),
    accessed: new Date().toISOString().slice(0, 10),
  };
  return {
    fields,
    extra: {
      type: journal ? 'journal-article' : (ld?.type ?? dcType),
      issued: issued.success ? issued.data : undefined,
      authors,
      editors: contributors(ld?.value.editor),
      language: clean(ld?.value.inLanguage, 200),
    },
  };
}
