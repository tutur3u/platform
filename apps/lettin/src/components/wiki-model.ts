import type {
  LettinDraft,
  LettinKind,
  LettinRecord,
} from '@tuturuuu/internal-api/lettin';
export const entryKinds: LettinKind[] = [
  'character',
  'location',
  'story',
  'world',
  'event',
  'role',
  'organization',
  'lore',
  'page',
];
export const wikiSections = [
  'overview',
  'characters',
  'locations',
  'stories',
  'worlds',
  'timeline',
  'relationships',
  'roles',
  'organizations',
  'lore',
  'pages',
] as const;
export type WikiSection = (typeof wikiSections)[number];
export function isWikiSection(value: string): value is WikiSection {
  return wikiSections.some((section) => section === value);
}
export const sectionKind: Partial<Record<WikiSection, LettinKind>> = {
  characters: 'character',
  locations: 'location',
  stories: 'story',
  worlds: 'world',
  timeline: 'event',
  roles: 'role',
  organizations: 'organization',
  lore: 'lore',
  pages: 'page',
};
export function wikiOf(draft: LettinDraft) {
  return draft.wiki ?? { aliases: [], facts: [], relationships: [] };
}
export function filterWiki(
  entries: LettinRecord[],
  section: WikiSection,
  search: string
) {
  const term = search.trim().toLocaleLowerCase();
  return entries.filter(
    ({ draft }) =>
      (section === 'timeline'
        ? draft.kind === 'event' || !!wikiOf(draft).chronology
        : !sectionKind[section] || draft.kind === sectionKind[section]) &&
      [
        draft.title,
        draft.description,
        ...draft.tags,
        ...wikiOf(draft).aliases,
        ...wikiOf(draft).facts.map((fact) => `${fact.label} ${fact.value}`),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term)
  );
}
export function timelineEntries(entries: LettinRecord[]) {
  return entries
    .filter((entry) => wikiOf(entry.draft).chronology)
    .sort(
      (a, b) =>
        wikiOf(a.draft).chronology!.order - wikiOf(b.draft).chronology!.order ||
        a.draft.title.localeCompare(b.draft.title)
    );
}
export function relationshipEdges(entries: LettinRecord[]) {
  const known = new Map(entries.map((entry) => [entry.id, entry]));
  return entries.flatMap((source) =>
    wikiOf(source.draft).relationships.flatMap((relation) => {
      const target = known.get(relation.targetId);
      return target ? [{ source, target, ...relation }] : [];
    })
  );
}

export function validWiki(draft: LettinDraft) {
  const wiki = wikiOf(draft);
  return (
    wiki.facts.every((fact) => !!fact.label.trim()) &&
    (!wiki.chronology ||
      (!!wiki.chronology.label.trim() &&
        Number.isFinite(wiki.chronology.order))) &&
    new Set(wiki.relationships.map((r) => `${r.targetId}:${r.kind}`)).size ===
      wiki.relationships.length
  );
}
