import CSL from 'citeproc';
import { z } from 'zod';
import { toCslItem } from './csl-model';
import { type CitationStyle, type CiteWork, CiteWorkSchema } from './model';
import { type FormattedOutput, parseFormattedHtml } from './output';
import apa from './styles/apa.csl.json';
import harvard from './styles/harvard-phase1.csl.json';
import enGB from './styles/locales-en-GB.xml.json';
import enUS from './styles/locales-en-US.xml.json';
import { type CitationValidationIssue, validateCitation } from './validation';

export const citationItemSchema = z.object({
  workId: z.string().min(1).max(256),
  locator: z.string().trim().min(1).max(200).optional(),
  label: z
    .enum([
      'page',
      'chapter',
      'section',
      'paragraph',
      'volume',
      'issue',
      'figure',
      'table',
      'line',
      'timestamp',
    ])
    .default('page'),
  suppressAuthor: z.boolean().default(false),
  prefix: z.string().max(200).optional(),
  suffix: z.string().max(200).optional(),
});
export const citationOccurrenceSchema = z.object({
  id: z.string().min(1).max(256),
  items: z.array(citationItemSchema).min(1).max(50),
  noteIndex: z.number().int().nonnegative().default(0),
});
export type CitationItem = z.input<typeof citationItemSchema>;
export type CitationOccurrence = z.input<typeof citationOccurrenceSchema>;
export type FormattedWork = {
  reference: FormattedOutput;
  inText: FormattedOutput;
  issues: CitationValidationIssue[];
};
export type FormattedDocument = {
  citations: { id: string; output: FormattedOutput }[];
  bibliography: { workId: string; output: FormattedOutput }[];
  issues: { workId: string; issues: CitationValidationIssue[] }[];
};

/** One fresh engine owns the whole document; no state leaks between documents. */
export function formatDocument({
  works: inputWorks,
  citations: inputCitations,
  style,
}: {
  works: readonly CiteWork[];
  citations: readonly CitationOccurrence[];
  style: CitationStyle;
}): FormattedDocument {
  if (inputWorks.length > 1000 || inputCitations.length > 5000)
    throw new RangeError('Citation document exceeds its item limit');
  const works = inputWorks.map((work) => CiteWorkSchema.parse(work));
  const citations = inputCitations.map((citation) =>
    citationOccurrenceSchema.parse(citation)
  );
  const items = new Map(works.map((work) => [work.id, toCslItem(work)]));
  if (items.size !== works.length)
    throw new Error('Citation work IDs must be unique');
  if (new Set(citations.map(({ id }) => id)).size !== citations.length)
    throw new Error('Citation occurrence IDs must be unique');
  for (const citation of citations)
    for (const item of citation.items)
      if (!items.has(item.workId))
        throw new Error(`Unknown citation work: ${item.workId}`);
  const engine = new CSL.Engine(
    {
      retrieveLocale: (language) => (language === 'en-GB' ? enGB : enUS),
      retrieveItem: (id) => {
        const item = items.get(id);
        if (!item) throw new Error('Unknown citation work');
        return item;
      },
    },
    style === 'apa' ? apa : harvard,
    style === 'apa' ? 'en-US' : 'en-GB',
    true
  );
  engine.setOutputFormat('html');
  const citedIds = [
    ...new Set(
      citations.flatMap(({ items: citationItems }) =>
        citationItems.map(({ workId }) => workId)
      )
    ),
  ];
  engine.updateItems(citations.length ? citedIds : works.map(({ id }) => id));
  const rendered = new Map<string, string>();
  const previous: [string, number][] = [];
  for (const citation of citations) {
    const [, updates] = engine.processCitationCluster(
      {
        citationID: citation.id,
        citationItems: citation.items.map(
          ({ workId, suppressAuthor, ...item }) => ({
            ...item,
            id: workId,
            'suppress-author': suppressAuthor,
          })
        ),
        properties: { noteIndex: citation.noteIndex },
      },
      previous,
      []
    );
    for (const [, html, id] of updates) rendered.set(id, html);
    previous.push([citation.id, citation.noteIndex]);
  }
  const bibliography = engine.makeBibliography();
  return {
    citations: citations.map(({ id }) => ({
      id,
      output: parseFormattedHtml(rendered.get(id) ?? ''),
    })),
    bibliography: bibliography
      ? bibliography[1].map((html, index) => ({
          workId: bibliography[0].entry_ids[index]?.[0] ?? '',
          output: parseFormattedHtml(html),
        }))
      : [],
    issues: works.map((work) => ({
      workId: work.id,
      issues: validateCitation(work, style),
    })),
  };
}

export function formatWork(
  work: CiteWork,
  style: CitationStyle,
  options: Omit<CitationItem, 'workId'> = {}
): FormattedWork {
  const result = formatDocument({
    works: [work],
    citations: [{ id: 'citation', items: [{ ...options, workId: work.id }] }],
    style,
  });
  return {
    reference: result.bibliography[0]?.output ?? { runs: [] },
    inText: result.citations[0]?.output ?? { runs: [] },
    issues: result.issues[0]?.issues ?? [],
  };
}
