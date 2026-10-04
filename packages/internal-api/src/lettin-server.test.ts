import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  scopes: [] as [string, string, unknown][],
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.scopes.push([table, column, value]);
          return query;
        },
        in: () => query,
        order: () => query,
        range: () => query,
        limit: () => query,
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: mocks.rows[table] ?? [], error: null }).then(
            resolve
          ),
      };
      return query;
    },
  }),
}));

import { EXOCORPSE_WORKSPACE_ID } from './lettin.js';
import { readExocorpseWikiSource } from './lettin-server.js';

beforeEach(() => {
  mocks.scopes.length = 0;
  mocks.rows = {
    workspace_external_project_collections: [
      { id: 'collection', slug: 'wiki' },
    ],
    workspace_external_project_entries: [
      { id: 'entry', collection_id: 'collection', title: 'Synthetic wiki' },
    ],
    workspace_external_project_blocks: [
      {
        entry_id: 'entry',
        block_type: 'markdown',
        content: 'Synthetic content',
      },
    ],
    workspace_external_project_assets: [
      {
        id: 'asset',
        entry_id: 'entry',
        asset_type: 'image',
        storage_path: 'synthetic/path.png',
        metadata: { privateInternalMarker: true },
      },
    ],
    workspace_external_project_entry_relations: [
      {
        from_entry_id: 'entry',
        to_entry_id: 'target',
        relation_type: 'related',
      },
    ],
  };
});

describe('authorized fixed-workspace wiki source projection', () => {
  it('preserves nested records and proxies storage without exposing raw asset metadata', async () => {
    const result = await readExocorpseWikiSource();
    const entry = result.content.entries[0]!;
    expect(entry.blocks).toEqual([
      { blockType: 'markdown', content: 'Synthetic content', title: undefined },
    ]);
    expect(entry.assets[0]).toEqual({
      assetType: 'image',
      sourceUrl: `https://tuturuuu.com/api/v1/workspaces/${EXOCORPSE_WORKSPACE_ID}/external-projects/assets/asset`,
      altText: undefined,
    });
    expect(entry.relations[0]?.targetEntryId).toBe('target');
    expect(mocks.scopes).toHaveLength(5);
    expect(
      mocks.scopes.every(
        ([, column, value]) =>
          column === 'ws_id' && value === EXOCORPSE_WORKSPACE_ID
      )
    ).toBe(true);
  });

  it('rejects a saturated related-record page rather than returning incomplete content', async () => {
    mocks.rows.workspace_external_project_blocks = Array.from(
      { length: 1000 },
      () => ({
        entry_id: 'entry',
        block_type: 'markdown',
        content: 'Synthetic',
      })
    );
    await expect(readExocorpseWikiSource()).rejects.toThrow(
      'Exocorpse source incomplete'
    );
  });
});
