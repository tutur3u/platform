import type {
  LettinDraft,
  LettinNode,
  LettinRecord,
} from '@tuturuuu/internal-api/lettin';
export type WikiPublication = 'all' | 'private' | 'published' | 'changed';
export type WikiSort = 'original' | 'titleAsc' | 'titleDesc' | 'kind';
export type WikiFilters = {
  search: string;
  publication: WikiPublication;
  tag: string;
  sort: WikiSort;
};
export const initialWikiFilters: WikiFilters = {
  search: '',
  publication: 'all',
  tag: '',
  sort: 'original',
};
export function searchableWikiText(draft: LettinDraft) {
  const words: string[] = [];
  const visit = (node: LettinNode) => {
    if (node.text) words.push(node.text);
    node.content?.forEach(visit);
  };
  visit(draft.content);
  return words.join(' ');
}
// Object key order is serialization detail; ordered arrays remain meaningful.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonical(v)])
  );
}
export function hasSavedWikiChanges(entry: LettinRecord) {
  return (
    entry.published !== null &&
    JSON.stringify(canonical(entry.draft)) !==
      JSON.stringify(canonical(entry.published))
  );
}
export function wikiTags(entries: LettinRecord[]) {
  return [...new Set(entries.flatMap((entry) => entry.draft.tags))].sort(
    (a, b) => a.localeCompare(b)
  );
}
export function applyWikiFilters(
  entries: LettinRecord[],
  filters: WikiFilters,
  locale: string
) {
  const filtered = entries.filter(
    (entry) =>
      (!filters.tag || entry.draft.tags.includes(filters.tag)) &&
      (filters.publication === 'all' ||
        (filters.publication === 'private'
          ? !entry.published
          : filters.publication === 'changed'
            ? hasSavedWikiChanges(entry)
            : !!entry.published))
  );
  if (filters.sort === 'original') return filtered;
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  });
  return filtered.sort((a, b) => {
    const title = collator.compare(a.draft.title, b.draft.title);
    const primary =
      filters.sort === 'kind'
        ? collator.compare(a.draft.kind, b.draft.kind) || title
        : filters.sort === 'titleDesc'
          ? -title
          : title;
    return primary || a.id.localeCompare(b.id);
  });
}
