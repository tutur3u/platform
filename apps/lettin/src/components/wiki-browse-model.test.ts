import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { expect, it } from 'vitest';
import {
  applyWikiFilters,
  hasSavedWikiChanges,
  initialWikiFilters,
  searchableWikiText,
  wikiTags,
} from './wiki-browse-model';
import { filterWiki, relationshipEdges, timelineEntries } from './wiki-model';

const record = (id: string, title = id): LettinRecord => ({
  id,
  version: 2,
  published: null,
  published_at: null,
  draft: {
    title,
    description: '',
    image: '',
    credit: '',
    kind: 'page',
    tags: [],
    links: [],
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Saved body phrase' }],
        },
      ],
    },
  },
});
function fixtures() {
  const privateEntry = record('private');
  privateEntry.draft.tags = ['story'];
  const published = record('published');
  published.published = structuredClone(published.draft);
  published.published_at = '2026-10-09';
  published.draft.tags = ['story'];
  published.published.tags = ['story'];
  const changed = record('changed');
  changed.published = structuredClone(changed.draft);
  changed.published_at = '2026-10-09';
  changed.draft.description = 'Unpublished saved summary';
  changed.draft.tags = ['art'];
  return [privateEntry, published, changed];
}
it('distinguishes private drafts, all published snapshots and saved changes', () => {
  const entries = fixtures();
  for (const [publication, ids] of [
    ['private', ['private']],
    ['published', ['published', 'changed']],
    ['changed', ['changed']],
  ] as const)
    expect(
      applyWikiFilters(
        entries,
        { ...initialWikiFilters, publication },
        'en'
      ).map((e) => e.id)
    ).toEqual(ids);
  expect(hasSavedWikiChanges(entries[0]!)).toBe(false);
});
it('compares field values without false changes from object key order or undefined optional fields', () => {
  const entry = record('same');
  entry.published = {
    ...entry.draft,
    content: { content: entry.draft.content.content, type: 'doc' },
    theme: undefined,
  };
  expect(hasSavedWikiChanges(entry)).toBe(false);
  entry.draft.content.content![0]!.content![0]!.text = 'Changed body';
  // Both fixture documents shared content; detach the saved published snapshot.
  entry.published = structuredClone(record('same').draft);
  expect(hasSavedWikiChanges(entry)).toBe(true);
});
it('treats array order and artwork/theme changes as saved differences', () => {
  const entry = record('changed');
  entry.draft.tags = ['a', 'b'];
  entry.published = structuredClone(entry.draft);
  entry.draft.tags = ['b', 'a'];
  expect(hasSavedWikiChanges(entry)).toBe(true);
  entry.draft = structuredClone(entry.published);
  entry.draft.image = 'https://example.com/new.png';
  expect(hasSavedWikiChanges(entry)).toBe(true);
});
it('composes exact case-sensitive tag and publication facets without mutating source order', () => {
  const entries = fixtures(),
    before = JSON.stringify(entries);
  expect(
    applyWikiFilters(
      entries,
      { ...initialWikiFilters, tag: 'story', publication: 'published' },
      'en'
    ).map((e) => e.id)
  ).toEqual(['published']);
  expect(
    applyWikiFilters(entries, { ...initialWikiFilters, tag: 'Story' }, 'en')
  ).toEqual([]);
  expect(wikiTags(entries)).toEqual(['art', 'story']);
  expect(JSON.stringify(entries)).toBe(before);
});
it('sorts titles naturally and deterministically, while original order is the default', () => {
  const entries = [
    record('b', 'Chapter 10'),
    record('a', 'Chapter 2'),
    record('z', 'Chapter 2'),
  ];
  expect(
    applyWikiFilters(entries, initialWikiFilters, 'en').map((e) => e.id)
  ).toEqual(['b', 'a', 'z']);
  expect(
    applyWikiFilters(
      entries,
      { ...initialWikiFilters, sort: 'titleAsc' },
      'en'
    ).map((e) => e.id)
  ).toEqual(['a', 'z', 'b']);
  expect(
    applyWikiFilters(
      entries,
      { ...initialWikiFilters, sort: 'titleDesc' },
      'en'
    ).map((e) => e.id)
  ).toEqual(['b', 'a', 'z']);
  expect(entries.map((e) => e.id)).toEqual(['b', 'a', 'z']);
});
it('sorts kind before localized title', () => {
  const entries = [record('location', 'A'), record('character', 'Z')];
  entries[0]!.draft.kind = 'location';
  entries[1]!.draft.kind = 'character';
  expect(
    applyWikiFilters(
      entries,
      { ...initialWikiFilters, sort: 'kind' },
      'vi'
    ).map((e) => e.id)
  ).toEqual(['character', 'location']);
});
it('searches nested saved text along with titles, aliases, tags and facts', () => {
  const entry = record('entry');
  entry.draft.kind = 'character';
  expect(searchableWikiText(entry.draft)).toContain('Saved body phrase');
  expect(filterWiki([entry], 'characters', 'BODY phrase')).toEqual([entry]);
  expect(filterWiki([entry], 'locations', 'body')).toEqual([]);
});
it('cannot recover private text from public snapshot projections', () => {
  const entry = record('entry');
  entry.published = structuredClone(entry.draft);
  entry.draft.content = {
    type: 'doc',
    content: [{ type: 'text', text: 'Private secret' }],
  };
  const projected = { ...entry, draft: entry.published };
  expect(filterWiki([projected], 'overview', 'secret')).toEqual([]);
  expect(filterWiki([projected], 'overview', 'body')).toEqual([projected]);
});
it('removes connections whose endpoints fail the selected facets', () => {
  const [privateEntry, published] = fixtures();
  privateEntry!.draft.wiki = {
    aliases: [],
    facts: [],
    relationships: [
      { targetId: published!.id, kind: 'related', label: 'Linked' },
    ],
  };
  expect(
    relationshipEdges(
      applyWikiFilters(
        [privateEntry!, published!],
        { ...initialWikiFilters, publication: 'private' },
        'en'
      )
    )
  ).toEqual([]);
  expect(
    relationshipEdges(
      applyWikiFilters([privateEntry!, published!], initialWikiFilters, 'en')
    )
  ).toHaveLength(1);
});
it('retains chronological timeline ordering after facets', () => {
  const [a, b] = fixtures();
  a!.draft.wiki = {
    aliases: [],
    facts: [],
    relationships: [],
    chronology: { order: 20, label: 'Later', era: '' },
  };
  b!.draft.wiki = {
    aliases: [],
    facts: [],
    relationships: [],
    chronology: { order: -10, label: 'Earlier', era: '' },
  };
  const filtered = applyWikiFilters(
    filterWiki([a!, b!], 'timeline', ''),
    initialWikiFilters,
    'en'
  );
  expect(timelineEntries(filtered).map((e) => e.id)).toEqual([
    'published',
    'private',
  ]);
});
