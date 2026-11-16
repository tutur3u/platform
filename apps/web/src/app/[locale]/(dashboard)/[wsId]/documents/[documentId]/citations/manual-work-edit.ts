import { type CiteWork, CiteWorkSchema } from '@tuturuuu/cite';
import {
  emptyManualDraft,
  MANUAL_FIELDS_BY_TYPE,
  MANUAL_SOURCE_TYPES,
  type ManualContributorRole,
  type ManualDraftResult,
  type ManualSourceType,
  type ManualTextField,
  type ManualWorkDraft,
  manualDraftToWork,
  newContributor,
} from './manual-work-draft';

/** Form fields stored at the top level of the work under the same name. */
const DIRECT_FIELDS = [
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
] as const satisfies readonly (ManualTextField & keyof CiteWork)[];

const AI_FIELDS = {
  modelName: 'modelName',
  modelVersion: 'modelVersion',
  modelProvider: 'provider',
} as const;
const INDIGENOUS_FIELDS = {
  nationOrCommunity: 'nationOrCommunity',
  knowledgeHolder: 'elderOrKnowledgeHolder',
  countryOrPlace: 'countryOrPlace',
} as const;

const isManualType = (type: string): type is ManualSourceType =>
  (MANUAL_SOURCE_TYPES as readonly string[]).includes(type);

/** Parsed canonical work the form can edit, or null to keep it opaque. */
export function editableWork(work: unknown): CiteWork | null {
  const parsed = CiteWorkSchema.safeParse(work);
  return parsed.success && isManualType(parsed.data.type) ? parsed.data : null;
}

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/** Prefills the form from a saved work, keeping types and contributor roles. */
export function manualDraftFromWork(work: CiteWork): ManualWorkDraft | null {
  if (!isManualType(work.type)) return null;
  const draft = emptyManualDraft(work.type);
  const roles: [ManualContributorRole, CiteWork['authors']][] = [
    ['author', work.authors],
    ['editor', work.editors],
    ['translator', work.translators],
  ];
  const contributors = roles.flatMap(([role, entries]) =>
    entries.map((source) =>
      source.kind === 'organization'
        ? newContributor('organization', { role, name: source.name, source })
        : newContributor('person', {
            role,
            family: source.family,
            given: source.given ?? '',
            source,
          })
    )
  );
  const issued = work.issued;
  const next: ManualWorkDraft = {
    ...draft,
    contributors: contributors.length ? contributors : draft.contributors,
    noDate: Boolean(issued && 'nd' in issued),
    year: issued && 'year' in issued ? text(issued.year) : '',
    month: issued && 'year' in issued ? text(issued.month) : '',
    day: issued && 'year' in issued ? text(issued.day) : '',
  };
  for (const field of DIRECT_FIELDS) next[field] = text(work[field]);
  const ai = work.aiGenerated as Record<string, unknown> | undefined;
  const indigenous = work.indigenous as Record<string, unknown> | undefined;
  for (const [field, key] of Object.entries(AI_FIELDS))
    next[field as keyof typeof AI_FIELDS] = text(ai?.[key]);
  for (const [field, key] of Object.entries(INDIGENOUS_FIELDS))
    next[field as keyof typeof INDIGENOUS_FIELDS] = text(indigenous?.[key]);
  return next;
}

function mergeNested(
  base: object | undefined,
  next: object | undefined,
  keys: readonly string[]
): Record<string, unknown> | undefined {
  const incoming = next as Record<string, unknown> | undefined;
  const merged: Record<string, unknown> = { ...base };
  for (const key of keys) {
    delete merged[key];
    if (incoming?.[key] !== undefined) merged[key] = incoming[key];
  }
  return Object.keys(merged).length ? merged : undefined;
}

function mergeIssued(base: CiteWork['issued'], next: CiteWork['issued']) {
  if (!base || !next || !('year' in base) || !('year' in next)) return next;
  const qualifiers = Object.fromEntries(
    Object.entries(base).filter(
      ([field]) => !['year', 'month', 'day'].includes(field)
    )
  );
  return { ...qualifiers, ...next };
}

/**
 * Applies the visible form fields onto the saved work. Everything the form
 * does not represent (identifiers it hides, provenance, date qualifiers,
 * contributor details, AI share links, protocol notes) is kept as saved.
 */
export function mergeEditedWork(
  base: CiteWork,
  draft: ManualWorkDraft
): ManualDraftResult {
  const built = manualDraftToWork(draft, base.id);
  if (built.kind !== 'ready') return built;
  const next = built.work;
  const visible = new Set<string>([
    'title',
    ...MANUAL_FIELDS_BY_TYPE[draft.type],
  ]);

  const merged: Record<string, unknown> = { ...base, type: next.type };
  merged.authors = next.authors;
  merged.editors = next.editors;
  merged.translators = next.translators;
  merged.issued = mergeIssued(base.issued, next.issued);
  for (const field of DIRECT_FIELDS) {
    if (!visible.has(field)) continue;
    delete merged[field];
    if (next[field] !== undefined) merged[field] = next[field];
  }
  if (draft.type === 'ai-generated') {
    merged.aiGenerated = mergeNested(
      base.aiGenerated,
      next.aiGenerated,
      Object.values(AI_FIELDS)
    );
  }
  if (draft.type === 'indigenous-knowledge') {
    merged.indigenous = mergeNested(
      base.indigenous,
      next.indigenous,
      Object.values(INDIGENOUS_FIELDS)
    );
  }
  for (const key of Object.keys(merged))
    if (merged[key] === undefined) delete merged[key];

  const parsed = CiteWorkSchema.safeParse(merged);
  if (
    parsed.success &&
    JSON.stringify({ ...base, provenance: undefined }) !==
      JSON.stringify({ ...parsed.data, provenance: undefined })
  ) {
    parsed.data.provenance = {
      ...base.provenance,
      verificationStatus: 'manual',
    };
  }
  return parsed.success
    ? { kind: 'ready', work: parsed.data }
    : { kind: 'invalid', fields: ['other'] };
}
