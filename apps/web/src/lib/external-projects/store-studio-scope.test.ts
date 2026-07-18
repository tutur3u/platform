import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
  listBlocks: vi.fn(),
  listCollections: vi.fn(),
  listEntries: vi.fn(),
  listFieldDefinitions: vi.fn(),
  listRelationData: vi.fn(),
}));

vi.mock('./store', () => ({
  buildDeliveryAssetUrl: vi.fn(
    (_workspaceId: string, asset: { id: string }) => `/assets/${asset.id}`
  ),
  buildExternalProjectLoadingData: vi.fn(() => null),
  EPM_IMAGE_PREVIEW_TRANSFORM: { width: 1600 },
  getExternalProjectAssetRevision: vi.fn(() => '1'),
  listWorkspaceExternalProjectAssetsByEntryIds: (
    ...args: Parameters<typeof mocks.listAssets>
  ) => mocks.listAssets(...args),
  listWorkspaceExternalProjectBlocksByEntryIds: (
    ...args: Parameters<typeof mocks.listBlocks>
  ) => mocks.listBlocks(...args),
  listWorkspaceExternalProjectCollections: (
    ...args: Parameters<typeof mocks.listCollections>
  ) => mocks.listCollections(...args),
  listWorkspaceExternalProjectEntries: (
    ...args: Parameters<typeof mocks.listEntries>
  ) => mocks.listEntries(...args),
  listWorkspaceExternalProjectFieldDefinitions: (
    ...args: Parameters<typeof mocks.listFieldDefinitions>
  ) => mocks.listFieldDefinitions(...args),
}));

vi.mock('./store-relations', () => ({
  listWorkspaceExternalProjectRelationData: (
    ...args: Parameters<typeof mocks.listRelationData>
  ) => mocks.listRelationData(...args),
}));

describe('scoped external-project studio data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCollections.mockResolvedValue([
      { id: 'stories', slug: 'stories' },
      { id: 'tags', slug: 'tags' },
      { id: 'worlds', slug: 'worlds' },
      { id: 'characters', slug: 'characters' },
    ]);
    mocks.listRelationData.mockResolvedValue({
      definitions: [
        {
          id: 'story-world',
          key: 'world',
          source_collection_id: 'stories',
        },
        {
          id: 'world-character',
          key: 'characters',
          source_collection_id: 'worlds',
        },
      ],
      relations: [
        {
          from_entry_id: 'story-entry',
          id: 'story-world-row',
          relation_definition_id: 'story-world',
          to_entry_id: 'world-entry',
        },
        {
          from_entry_id: 'world-entry',
          id: 'world-character-row',
          relation_definition_id: 'world-character',
          to_entry_id: 'character-entry',
        },
      ],
      targets: [
        {
          relation_definition_id: 'story-world',
          target_collection_id: 'worlds',
        },
        {
          relation_definition_id: 'world-character',
          target_collection_id: 'characters',
        },
      ],
    });
    mocks.listEntries.mockResolvedValue([
      {
        collection_id: 'stories',
        id: 'story-entry',
        source_adapter: 'exocorpse',
      },
      { collection_id: 'tags', id: 'tag-entry' },
      { collection_id: 'worlds', id: 'world-entry' },
    ]);
    mocks.listFieldDefinitions.mockResolvedValue([
      { collection_id: 'stories', id: 'story-field' },
    ]);
    mocks.listBlocks.mockResolvedValue([
      { entry_id: 'story-entry', id: 'story-block' },
    ]);
    mocks.listAssets.mockResolvedValue([
      {
        asset_type: 'image',
        entry_id: 'story-entry',
        id: 'story-asset',
        updated_at: '2026-07-19T00:00:00Z',
      },
    ]);
  });

  it('loads source collections plus relation targets without unrelated content', async () => {
    const { getWorkspaceExternalProjectScopedStudioData } = await import(
      './store-studio-scope'
    );
    const studio = await getWorkspaceExternalProjectScopedStudioData(
      'workspace-id',
      ['stories', 'tags'],
      {} as never
    );

    expect(mocks.listEntries).toHaveBeenCalledWith(
      'workspace-id',
      {
        collectionIds: ['stories', 'tags', 'worlds'],
        includeDrafts: true,
      },
      expect.anything()
    );
    expect(mocks.listBlocks).toHaveBeenCalledWith(
      'workspace-id',
      ['story-entry', 'tag-entry'],
      expect.anything()
    );
    expect(studio.collections.map((collection) => collection.id)).toEqual([
      'stories',
      'tags',
      'worlds',
    ]);
    expect(
      studio.relationDefinitions?.map((definition) => definition.id)
    ).toEqual(['story-world']);
    expect(studio.relations?.map((relation) => relation.id)).toEqual([
      'story-world-row',
    ]);
    expect(studio.importJobs).toEqual([]);
    expect(studio.publishEvents).toEqual([]);
  });
});
