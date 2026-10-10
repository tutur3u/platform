import type { LettinRecord, LettinWiki } from '@tuturuuu/internal-api/lettin';
import { expect, it } from 'vitest';
import {
  addRelationship,
  canChangeRelationshipKind,
  changeRelationshipKind,
  relationshipTargets,
} from './relationship-authoring-model';
import { createStarterDraft } from './starter-drafts';

const make = (
  id: string,
  title: string,
  kind: 'character' | 'location' = 'character'
): LettinRecord => ({
  id,
  version: 1,
  published: null,
  published_at: null,
  draft: {
    ...createStarterDraft(title, 'blank', (key) => key),
    kind,
    wiki: { aliases: ['Đồng Minh'], facts: [], relationships: [] },
  },
});
const entries = [
  make('self', 'Self'),
  make('a', 'Alice'),
  make('b', 'Castle', 'location'),
];
const wiki: LettinWiki = {
  aliases: ['Owner alias'],
  facts: [{ label: 'Fact', value: 'Value' }],
  relationships: [{ targetId: 'a', kind: 'friend', label: 'Custom label' }],
};
it('searches title/aliases case-insensitively and filters target kinds without mutating order', () => {
  expect(
    relationshipTargets(entries, 'self', wiki, 'related', '  aLiCe ', '').map(
      (e) => e.id
    )
  ).toEqual(['a']);
  expect(
    relationshipTargets(
      entries,
      'self',
      wiki,
      'related',
      'đỒng minh',
      'location'
    ).map((e) => e.id)
  ).toEqual(['b']);
  expect(
    relationshipTargets(entries, 'self', wiki, 'related', 'missing', '')
  ).toEqual([]);
  expect(entries.map((e) => e.id)).toEqual(['self', 'a', 'b']);
});
it('excludes self and existing target/type but permits a different type on the same target', () => {
  expect(
    relationshipTargets(entries, 'self', wiki, 'friend', '', '').map(
      (e) => e.id
    )
  ).toEqual(['b']);
  expect(
    relationshipTargets(entries, 'self', wiki, 'family', '', '').map(
      (e) => e.id
    )
  ).toEqual(['a', 'b']);
});
it('rejects missing/self/duplicate targets and enforces the 100 relationship bound', () => {
  for (const id of ['missing', 'self', 'a'])
    expect(addRelationship(wiki, entries, 'self', id, 'friend')).toBe(wiki);
  const full = {
    ...wiki,
    relationships: Array.from({ length: 100 }, (_, i) => ({
      targetId: `old${i}`,
      kind: 'related' as const,
      label: '',
    })),
  };
  expect(addRelationship(full, entries, 'self', 'b', 'related')).toBe(full);
});
it('adds only a typed reference and preserves facts, aliases, labels and source records', () => {
  const result = addRelationship(wiki, entries, 'self', 'a', 'family');
  expect(result.relationships).toEqual([
    ...wiki.relationships,
    { targetId: 'a', kind: 'family', label: '' },
  ]);
  expect(result.facts).toBe(wiki.facts);
  expect(result.aliases).toBe(wiki.aliases);
  expect(wiki.relationships).toHaveLength(1);
  expect(entries[1]?.published).toBeNull();
});
it('blocks conflicting kind edits without erasing labels or unrelated properties', () => {
  const source = addRelationship(wiki, entries, 'self', 'a', 'family');
  expect(canChangeRelationshipKind(source, 0, 'family')).toBe(false);
  expect(changeRelationshipKind(source, 0, 'family')).toBe(source);
  expect(changeRelationshipKind(source, 99, 'rival')).toBe(source);
  const changed = changeRelationshipKind(source, 0, 'rival');
  expect(changed.relationships[0]).toEqual({
    targetId: 'a',
    kind: 'rival',
    label: 'Custom label',
  });
  expect(changed.relationships[1]).toBe(source.relationships[1]);
});
it('retains unavailable references when adding or editing a different relationship', () => {
  const source = {
    ...wiki,
    relationships: [
      { targetId: 'retired', kind: 'related' as const, label: 'Keep me' },
    ],
  };
  expect(
    addRelationship(source, entries, 'self', 'b', 'located').relationships[0]
  ).toBe(source.relationships[0]);
  expect(
    changeRelationshipKind(source, 0, 'friend').relationships[0]?.label
  ).toBe('Keep me');
});
