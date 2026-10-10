import type {
  LettinKind,
  LettinRecord,
  LettinRelationshipKind,
  LettinWiki,
} from '@tuturuuu/internal-api/lettin';
import { wikiOf } from './wiki-model';

export const relationshipKinds: LettinRelationshipKind[] = [
  'related',
  'family',
  'friend',
  'rival',
  'member',
  'located',
  'part',
  'role',
  'appears',
];
export function relationshipTargets(
  entries: LettinRecord[],
  recordId: string,
  wiki: LettinWiki,
  kind: LettinRelationshipKind,
  search: string,
  entryKind: LettinKind | ''
) {
  const term = search.trim().toLocaleLowerCase();
  return entries.filter(
    ({ id, draft }) =>
      id !== recordId &&
      (!entryKind || draft.kind === entryKind) &&
      !wiki.relationships.some((r) => r.targetId === id && r.kind === kind) &&
      [draft.title, ...wikiOf(draft).aliases]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term)
  );
}
export function canChangeRelationshipKind(
  wiki: LettinWiki,
  index: number,
  kind: LettinRelationshipKind
) {
  const relation = wiki.relationships[index];
  return (
    !!relation &&
    relationshipKinds.includes(kind) &&
    !wiki.relationships.some(
      (r, i) =>
        i !== index && r.targetId === relation.targetId && r.kind === kind
    )
  );
}
export function changeRelationshipKind(
  wiki: LettinWiki,
  index: number,
  kind: LettinRelationshipKind
): LettinWiki {
  return canChangeRelationshipKind(wiki, index, kind)
    ? {
        ...wiki,
        relationships: wiki.relationships.map((r, i) =>
          i === index ? { ...r, kind } : r
        ),
      }
    : wiki;
}
export function addRelationship(
  wiki: LettinWiki,
  entries: LettinRecord[],
  recordId: string,
  targetId: string,
  kind: LettinRelationshipKind
): LettinWiki {
  if (
    wiki.relationships.length >= 100 ||
    !relationshipKinds.includes(kind) ||
    !relationshipTargets(entries, recordId, wiki, kind, '', '').some(
      (e) => e.id === targetId
    )
  )
    return wiki;
  return {
    ...wiki,
    relationships: [...wiki.relationships, { targetId, kind, label: '' }],
  };
}
