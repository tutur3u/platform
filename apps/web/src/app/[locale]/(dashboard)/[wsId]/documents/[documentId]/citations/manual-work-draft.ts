import {
  type CiteContributor,
  type CiteWork,
  CiteWorkSchema,
  PHASE1_SOURCE_TYPES,
} from '@tuturuuu/cite';

export type ManualSourceType = (typeof PHASE1_SOURCE_TYPES)[number];
export const MANUAL_SOURCE_TYPES = PHASE1_SOURCE_TYPES;

export const MANUAL_CONTRIBUTOR_ROLES = [
  'author',
  'editor',
  'translator',
] as const;
export type ManualContributorRole = (typeof MANUAL_CONTRIBUTOR_ROLES)[number];

export type ManualContributor = {
  key: string;
  kind: 'person' | 'organization';
  role: ManualContributorRole;
  /** Saved contributor this row edits; keeps fields the form does not show. */
  source?: CiteContributor;
  family: string;
  given: string;
  name: string;
};

export const MANUAL_TEXT_FIELDS = [
  'title',
  'containerTitle',
  'publisher',
  'publisherPlace',
  'edition',
  'volume',
  'issue',
  'pages',
  'reportNumber',
  'standardNumber',
  'genre',
  'doi',
  'isbn',
  'url',
  'accessed',
  'modelName',
  'modelVersion',
  'modelProvider',
  'nationOrCommunity',
  'knowledgeHolder',
  'countryOrPlace',
] as const;
export type ManualTextField = (typeof MANUAL_TEXT_FIELDS)[number];

export type ManualWorkDraft = {
  type: ManualSourceType;
  contributors: ManualContributor[];
  year: string;
  month: string;
  day: string;
  noDate: boolean;
} & Record<ManualTextField, string>;

const LINKS: ManualTextField[] = ['doi', 'url'];
const PERIODICAL: ManualTextField[] = [
  'containerTitle',
  'volume',
  'issue',
  'pages',
];
const WEB: ManualTextField[] = ['containerTitle', 'url', 'accessed'];

/** Fields offered per source family; hidden values never reach the work. */
export const MANUAL_FIELDS_BY_TYPE: Record<
  ManualSourceType,
  readonly ManualTextField[]
> = {
  book: ['publisher', 'publisherPlace', 'edition', 'isbn', ...LINKS],
  'edited-book': ['publisher', 'publisherPlace', 'edition', 'isbn', ...LINKS],
  'book-chapter': [
    'containerTitle',
    'pages',
    'publisher',
    'publisherPlace',
    'edition',
    'isbn',
    ...LINKS,
  ],
  'journal-article': [...PERIODICAL, ...LINKS],
  'newspaper-article': ['containerTitle', 'pages', 'url', 'accessed'],
  'magazine-article': [...PERIODICAL, ...LINKS],
  'conference-paper': ['containerTitle', 'publisher', 'pages', ...LINKS],
  webpage: WEB,
  'web-document': [...WEB, 'publisher'],
  'blog-post': WEB,
  report: ['publisher', 'reportNumber', ...LINKS],
  dataset: ['publisher', 'edition', ...LINKS],
  thesis: ['genre', 'publisher', ...LINKS],
  standard: ['publisher', 'standardNumber', ...LINKS],
  'indigenous-knowledge': [
    'nationOrCommunity',
    'knowledgeHolder',
    'countryOrPlace',
    'url',
    'accessed',
  ],
  'ai-generated': [
    'modelName',
    'modelVersion',
    'modelProvider',
    'url',
    'accessed',
  ],
  software: ['publisher', 'edition', ...LINKS],
};

let contributorSequence = 0;
/** Edited books are credited to their editors by default. */
export function defaultContributorRole(
  type: ManualSourceType
): ManualContributorRole {
  return type === 'edited-book' ? 'editor' : 'author';
}

export function newContributor(
  kind: ManualContributor['kind'] = 'person',
  values: Partial<
    Pick<ManualContributor, 'family' | 'given' | 'name' | 'role' | 'source'>
  > = {}
): ManualContributor {
  contributorSequence += 1;
  return {
    key: `contributor-${contributorSequence}`,
    kind,
    role: 'author',
    family: '',
    given: '',
    name: '',
    ...values,
  };
}

export function emptyManualDraft(
  type: ManualSourceType = 'journal-article'
): ManualWorkDraft {
  const text = Object.fromEntries(
    MANUAL_TEXT_FIELDS.map((field) => [field, ''])
  ) as Record<ManualTextField, string>;
  return {
    ...text,
    type,
    contributors: [
      newContributor('person', { role: defaultContributorRole(type) }),
    ],
    year: '',
    month: '',
    day: '',
    noDate: false,
  };
}

const LEGACY_TYPES: Record<string, ManualSourceType> = {
  book: 'book',
  'article-journal': 'journal-article',
  webpage: 'webpage',
};

function str(value: unknown) {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : '';
}

/** Seeds the form from an incomplete capture draft (legacy fields shape). */
export function manualDraftFrom(value: unknown): ManualWorkDraft {
  if (typeof value !== 'object' || value === null) return emptyManualDraft();
  const fields = value as Record<string, unknown>;
  const draft = emptyManualDraft(LEGACY_TYPES[str(fields.type)] ?? 'webpage');
  const authors = Array.isArray(fields.authors)
    ? fields.authors.flatMap((author) => {
        if (typeof author !== 'object' || author === null) return [];
        const { family, given } = author as Record<string, unknown>;
        return str(family)
          ? [
              newContributor('person', {
                family: str(family),
                given: str(given),
              }),
            ]
          : [];
      })
    : [];
  return {
    ...draft,
    contributors: authors.length ? authors : draft.contributors,
    title: str(fields.title),
    year: str(fields.year),
    containerTitle: str(fields.containerTitle),
    publisher: str(fields.publisher),
    publisherPlace: str(fields.publisherPlace),
    volume: str(fields.volume),
    issue: str(fields.issue),
    pages: str(fields.pages),
    doi: str(fields.DOI),
    isbn: str(fields.ISBN),
    url: str(fields.URL),
    accessed: str(fields.accessed),
  };
}

export type ManualDraftResult =
  | { kind: 'incomplete' }
  | { kind: 'invalid'; fields: string[] }
  | { kind: 'ready'; work: CiteWork };

const toInt = (value: string) =>
  /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

/** Validates the visible fields through the canonical schema; never fills gaps. */
export function manualDraftToWork(
  draft: ManualWorkDraft,
  id: string
): ManualDraftResult {
  const visible = new Set<ManualTextField>([
    'title',
    ...MANUAL_FIELDS_BY_TYPE[draft.type],
  ]);
  const text = (field: ManualTextField) =>
    visible.has(field) ? draft[field].trim() || undefined : undefined;
  const title = text('title');
  if (!title) return { kind: 'incomplete' };

  const byRole = (role: ManualContributorRole) =>
    draft.contributors.flatMap<CiteContributor>((contributor) => {
      if (contributor.role !== role) return [];
      const source = contributor.source;
      if (contributor.kind === 'organization') {
        const name = contributor.name.trim();
        if (!name) return [];
        return [
          {
            ...(source?.kind === 'organization' ? source : {}),
            kind: 'organization' as const,
            name,
          },
        ];
      }
      const family = contributor.family.trim();
      const given = contributor.given.trim();
      if (!family && !given) return [];
      const { given: _given, ...kept } =
        source?.kind === 'person' ? source : { given: undefined };
      return [
        {
          ...kept,
          kind: 'person' as const,
          family,
          ...(given ? { given } : {}),
        },
      ];
    });
  const issued = draft.noDate
    ? { nd: true as const }
    : draft.year.trim()
      ? {
          year: toInt(draft.year),
          ...(draft.month.trim() ? { month: toInt(draft.month) } : {}),
          ...(draft.day.trim() ? { day: toInt(draft.day) } : {}),
        }
      : undefined;
  const modelName = text('modelName');
  const indigenous = {
    nationOrCommunity: text('nationOrCommunity'),
    elderOrKnowledgeHolder: text('knowledgeHolder'),
    countryOrPlace: text('countryOrPlace'),
  };

  const parsed = CiteWorkSchema.safeParse({
    id,
    type: draft.type,
    title,
    authors: byRole('author'),
    editors: byRole('editor'),
    translators: byRole('translator'),
    issued,
    containerTitle: text('containerTitle'),
    publisher: text('publisher'),
    publisherPlace: text('publisherPlace'),
    edition: text('edition'),
    volume: text('volume'),
    issue: text('issue'),
    pages: text('pages'),
    reportNumber: text('reportNumber'),
    standardNumber: text('standardNumber'),
    genre: text('genre'),
    doi: text('doi'),
    isbn: text('isbn'),
    url: text('url'),
    accessed: text('accessed'),
    ...(draft.type === 'ai-generated' && modelName
      ? {
          aiGenerated: {
            modelName,
            modelVersion: text('modelVersion'),
            provider: text('modelProvider'),
          },
        }
      : {}),
    ...(draft.type === 'indigenous-knowledge' &&
    Object.values(indigenous).some(Boolean)
      ? { indigenous }
      : {}),
    provenance: { sourceCaptureMethod: 'manual', verificationStatus: 'manual' },
  });
  if (parsed.success) return { kind: 'ready', work: parsed.data };
  const fields = [
    ...new Set(
      parsed.error.issues.map((issue) => {
        const [head, sub] = issue.path.map(String);
        if (head === 'authors' || head === 'editors' || head === 'translators')
          return 'contributors';
        if (head === 'issued') return 'date';
        if (head === 'aiGenerated')
          return sub === 'modelVersion'
            ? 'modelVersion'
            : sub === 'provider'
              ? 'modelProvider'
              : 'modelName';
        if (head === 'indigenous')
          return sub === 'elderOrKnowledgeHolder'
            ? 'knowledgeHolder'
            : (sub ?? 'nationOrCommunity');
        return head ?? 'title';
      })
    ),
  ];
  return { kind: 'invalid', fields };
}
