import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { describe, expect, it } from 'vitest';
import {
  filterWiki,
  relationshipEdges,
  timelineEntries,
  validWiki,
} from './wiki-model';

const record = (
  id: string,
  kind: LettinRecord['draft']['kind'],
  order?: number
): LettinRecord => ({
  id,
  version: 1,
  published: null,
  published_at: null,
  draft: {
    title: id,
    kind,
    description: '',
    image: '',
    credit: '',
    tags: [],
    links: [],
    content: { type: 'doc' },
    wiki: {
      aliases: ['The Wayfarer'],
      facts: [{ label: 'Home', value: 'North' }],
      relationships: [],
      ...(order === undefined
        ? {}
        : { chronology: { order, label: 'Arrival', era: 'First Age' } }),
    },
  },
});
describe('Wiki browsing', () => {
  const entries = [
    record('person', 'character', 20),
    record('city', 'location', -10),
    record('crossing', 'event'),
    record('story', 'story'),
  ];
  it('finds typed entries by aliases and properties', () => {
    expect(
      filterWiki(entries, 'characters', 'wayfarer').map((r) => r.id)
    ).toEqual(['person']);
    expect(filterWiki(entries, 'locations', 'north').map((r) => r.id)).toEqual([
      'city',
    ]);
  });
  it('includes dated characters and locations alongside undated events', () => {
    expect(filterWiki(entries, 'timeline', '').map((r) => r.id)).toEqual([
      'person',
      'city',
      'crossing',
    ]);
    expect(timelineEntries(entries).map((r) => r.id)).toEqual([
      'city',
      'person',
    ]);
  });
  it('resolves graph edges only to known records and detects invalid editing states', () => {
    const person = record('person', 'character');
    person.draft.wiki!.relationships = [
      { targetId: 'city', kind: 'located', label: 'Lives in' },
      { targetId: 'private', kind: 'friend', label: '' },
    ];
    expect(
      relationshipEdges([person, entries[1]!]).map((e) => e.target.id)
    ).toEqual(['city']);
    expect(validWiki(person.draft)).toBe(true);
    person.draft.wiki!.relationships.push(person.draft.wiki!.relationships[0]!);
    expect(validWiki(person.draft)).toBe(false);
    expect(
      validWiki({
        ...entries[0]!.draft,
        wiki: {
          ...entries[0]!.draft.wiki!,
          facts: [{ label: ' ', value: '' }],
        },
      })
    ).toBe(false);
  });
});
