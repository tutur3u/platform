import type { ExternalProjectEntry } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { filterCmsEntries } from './cms-studio-utils';

function entry(
  id: string,
  collectionId: string,
  status: ExternalProjectEntry['status'],
  overrides: Partial<ExternalProjectEntry> = {}
): ExternalProjectEntry {
  return {
    collection_id: collectionId,
    id,
    slug: `${id}-path`,
    status,
    subtitle: null,
    summary: null,
    title: `Content ${id}`,
    ...overrides,
  } as ExternalProjectEntry;
}

const entries = [
  entry('alpha', 'pages', 'draft', { summary: 'Launch checklist' }),
  entry('beta', 'pages', 'published', { subtitle: 'Customer story' }),
  entry('gamma', 'posts', 'scheduled', { title: 'Quarterly update' }),
];

describe('CMS library filters', () => {
  it('combines the active section, publishing status, and search query', () => {
    expect(
      filterCmsEntries(entries, {
        collectionId: 'pages',
        query: 'customer',
        status: 'published',
      }).map((item) => item.id)
    ).toEqual(['beta']);
  });

  it('searches visitor-facing copy and URL paths case-insensitively', () => {
    expect(
      filterCmsEntries(entries, { query: 'LAUNCH', status: 'all' }).map(
        (item) => item.id
      )
    ).toEqual(['alpha']);
    expect(
      filterCmsEntries(entries, { query: 'gamma-path', status: 'all' }).map(
        (item) => item.id
      )
    ).toEqual(['gamma']);
  });

  it('returns every entry when no section, status, or search is active', () => {
    expect(
      filterCmsEntries(entries, { query: '   ', status: 'all' }).map(
        (item) => item.id
      )
    ).toEqual(['alpha', 'beta', 'gamma']);
  });
});
