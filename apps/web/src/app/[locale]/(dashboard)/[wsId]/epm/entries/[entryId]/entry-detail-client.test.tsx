import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEpmStrings } from '../../epm-strings';
import { EntryDetailClient } from './entry-detail-client';

const {
  createWorkspaceExternalProjectEntryMock,
  createWorkspaceExternalProjectAssetMock,
  createWorkspaceExternalProjectBlockMock,
  deleteWorkspaceExternalProjectAssetMock,
  deleteWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntryMock,
  invalidateQueriesMock,
  publishWorkspaceExternalProjectEntryMock,
  routerPushMock,
  routerRefreshMock,
  updateWorkspaceExternalProjectAssetMock,
  updateWorkspaceExternalProjectBlockMock,
  updateWorkspaceExternalProjectEntryMock,
  optimizeEpmMediaUploadMock,
  uploadWorkspaceExternalProjectAssetFileMock,
} = vi.hoisted(() => ({
  createWorkspaceExternalProjectEntryMock: vi.fn(),
  createWorkspaceExternalProjectAssetMock: vi.fn(),
  createWorkspaceExternalProjectBlockMock: vi.fn(),
  deleteWorkspaceExternalProjectAssetMock: vi.fn(),
  deleteWorkspaceExternalProjectEntryMock: vi.fn(),
  duplicateWorkspaceExternalProjectEntryMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  optimizeEpmMediaUploadMock: vi.fn(),
  publishWorkspaceExternalProjectEntryMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  updateWorkspaceExternalProjectAssetMock: vi.fn(),
  updateWorkspaceExternalProjectBlockMock: vi.fn(),
  updateWorkspaceExternalProjectEntryMock: vi.fn(),
  uploadWorkspaceExternalProjectAssetFileMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceExternalProjectEntry: createWorkspaceExternalProjectEntryMock,
  createWorkspaceExternalProjectAsset: createWorkspaceExternalProjectAssetMock,
  createWorkspaceExternalProjectBlock: createWorkspaceExternalProjectBlockMock,
  deleteWorkspaceExternalProjectAsset: deleteWorkspaceExternalProjectAssetMock,
  deleteWorkspaceExternalProjectEntry: deleteWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntry:
    duplicateWorkspaceExternalProjectEntryMock,
  publishWorkspaceExternalProjectEntry:
    publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectAsset: updateWorkspaceExternalProjectAssetMock,
  updateWorkspaceExternalProjectBlock: updateWorkspaceExternalProjectBlockMock,
  updateWorkspaceExternalProjectEntry: updateWorkspaceExternalProjectEntryMock,
  uploadWorkspaceExternalProjectAssetFile:
    uploadWorkspaceExternalProjectAssetFileMock,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
  }),
  usePathname: () => '/ws_123/epm/entries/entry-1',
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

vi.mock('../../epm-media-upload', () => ({
  optimizeEpmMediaUpload: (
    ...args: Parameters<typeof optimizeEpmMediaUploadMock>
  ) => optimizeEpmMediaUploadMock(...args),
}));

describe('EntryDetailClient', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const strings = buildEpmStrings((key) => key);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
      },
    });
    queryClient.invalidateQueries =
      invalidateQueriesMock.mockResolvedValue(undefined);
    vi.clearAllMocks();
    optimizeEpmMediaUploadMock.mockImplementation(async (file: File) => file);

    createWorkspaceExternalProjectEntryMock.mockResolvedValue({
      collection_id: 'collection-sections',
      created_at: '2026-04-19T00:00:00.000Z',
      created_by: null,
      id: 'entry-gallery',
      metadata: {},
      profile_data: {},
      published_at: null,
      scheduled_for: null,
      slug: 'gallery',
      status: 'draft',
      subtitle: null,
      summary: null,
      title: 'Gallery',
      updated_at: '2026-04-19T00:00:00.000Z',
      updated_by: null,
      ws_id: 'ws_123',
    });
    updateWorkspaceExternalProjectEntryMock.mockResolvedValue({
      collection_id: 'collection-1',
      created_at: '2026-04-19T00:00:00.000Z',
      created_by: null,
      id: 'entry-1',
      metadata: {},
      profile_data: {},
      published_at: null,
      scheduled_for: null,
      slug: 'entry-one',
      status: 'draft',
      subtitle: 'Subtitle',
      summary: 'Summary',
      title: 'Updated title',
      updated_at: '2026-04-19T00:00:00.000Z',
      updated_by: null,
      ws_id: 'ws_123',
    });
    uploadWorkspaceExternalProjectAssetFileMock.mockResolvedValue({
      fullPath: 'full/cover.png',
      path: 'covers/cover.png',
    });
    createWorkspaceExternalProjectAssetMock.mockResolvedValue({
      alt_text: 'Updated title',
      asset_type: 'image',
      asset_url: 'https://cdn.example.com/cover.png',
      block_id: null,
      created_at: '2026-04-19T00:00:00.000Z',
      entry_id: 'entry-1',
      id: 'asset-1',
      metadata: {},
      preview_url: 'https://cdn.example.com/cover-preview.png',
      sort_order: 0,
      source_url: null,
      storage_path: 'covers/cover.png',
      updated_at: '2026-04-19T00:00:00.000Z',
      ws_id: 'ws_123',
    });
    deleteWorkspaceExternalProjectAssetMock.mockResolvedValue({
      id: 'asset-2',
    });
    createWorkspaceExternalProjectBlockMock.mockResolvedValue({
      block_type: 'markdown',
      content: { markdown: 'Body markdown' },
      created_at: '2026-04-19T00:00:00.000Z',
      entry_id: 'entry-1',
      id: 'block-1',
      sort_order: 0,
      title: 'Body markdown',
      updated_at: '2026-04-19T00:00:00.000Z',
      ws_id: 'ws_123',
    });
    updateWorkspaceExternalProjectBlockMock.mockResolvedValue({
      block_type: 'markdown',
      content: { markdown: 'Updated body markdown' },
      created_at: '2026-04-19T00:00:00.000Z',
      entry_id: 'entry-1',
      id: 'block-1',
      sort_order: 0,
      title: 'Body markdown',
      updated_at: '2026-04-19T00:00:00.000Z',
      ws_id: 'ws_123',
    });
    deleteWorkspaceExternalProjectEntryMock.mockResolvedValue({
      id: 'entry-1',
    });
  });

  function renderClient() {
    render(
      <EntryDetailClient
        binding={
          {
            adapter: 'yoola',
            canonical_id: 'project-1',
            canonical_project: {
              adapter: 'yoola',
              allowed_collections: ['artworks'],
              allowed_features: [],
              delivery_profile: {},
              display_name: 'Yoola',
              id: 'project-1',
              is_active: true,
              metadata: {},
            },
            enabled: true,
          } as any
        }
        entryId="entry-1"
        initialStudio={{
          assets: [],
          blocks: [],
          collections: [
            {
              collection_type: 'artworks',
              config: {},
              description: 'Artwork collection',
              id: 'collection-1',
              is_enabled: true,
              slug: 'artworks',
              title: 'Artworks',
              ws_id: 'ws_123',
            } as any,
          ],
          entries: [
            {
              collection_id: 'collection-1',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'entry-1',
              metadata: {},
              profile_data: {},
              published_at: null,
              scheduled_for: null,
              slug: 'entry-one',
              status: 'draft',
              subtitle: 'Subtitle',
              summary: 'Summary',
              title: 'Entry One',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
          ],
          importJobs: [],
          loadingData: null,
          publishEvents: [],
        }}
        strings={strings}
        workspaceId="ws_123"
      />,
      { wrapper }
    );
  }

  function renderClientWithAssets() {
    render(
      <EntryDetailClient
        binding={
          {
            adapter: 'yoola',
            canonical_id: 'project-1',
            canonical_project: {
              adapter: 'yoola',
              allowed_collections: ['artworks'],
              allowed_features: [],
              delivery_profile: {},
              display_name: 'Yoola',
              id: 'project-1',
              is_active: true,
              metadata: {},
            },
            enabled: true,
          } as any
        }
        entryId="entry-1"
        initialStudio={{
          assets: [
            {
              alt_text: 'Entry One',
              asset_type: 'image',
              asset_url: 'https://cdn.example.com/cover.png',
              entry_id: 'entry-1',
              id: 'asset-1',
              metadata: {},
              preview_url: 'https://cdn.example.com/cover-preview.png',
              sort_order: 0,
            },
            {
              alt_text: 'Alt asset',
              asset_type: 'image',
              asset_url: 'https://cdn.example.com/detail.png',
              entry_id: 'entry-1',
              id: 'asset-2',
              metadata: {
                caption: 'Old caption',
              },
              preview_url: 'https://cdn.example.com/detail-preview.png',
              sort_order: 1,
            },
          ] as any,
          blocks: [],
          collections: [
            {
              collection_type: 'artworks',
              config: {},
              description: 'Artwork collection',
              id: 'collection-1',
              is_enabled: true,
              slug: 'artworks',
              title: 'Artworks',
              ws_id: 'ws_123',
            } as any,
          ],
          entries: [
            {
              collection_id: 'collection-1',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'entry-1',
              metadata: {},
              profile_data: {},
              published_at: null,
              scheduled_for: null,
              slug: 'entry-one',
              status: 'draft',
              subtitle: 'Subtitle',
              summary: 'Summary',
              title: 'Entry One',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
          ],
          importJobs: [],
          loadingData: null,
          publishEvents: [],
        }}
        strings={strings}
        workspaceId="ws_123"
      />,
      { wrapper }
    );
  }

  function renderClientWithWritingSection() {
    render(
      <EntryDetailClient
        binding={
          {
            adapter: 'yoola',
            canonical_id: 'project-1',
            canonical_project: {
              adapter: 'yoola',
              allowed_collections: ['singleton-sections', 'lore-capsules'],
              allowed_features: [],
              delivery_profile: {},
              display_name: 'Yoola',
              id: 'project-1',
              is_active: true,
              metadata: {},
            },
            enabled: true,
          } as any
        }
        entryId="entry-writing"
        initialStudio={{
          assets: [],
          blocks: [],
          collections: [
            {
              collection_type: 'singleton-sections',
              config: {},
              description: 'Singleton sections',
              id: 'collection-sections',
              is_enabled: true,
              slug: 'singleton-sections',
              title: 'Singleton sections',
              ws_id: 'ws_123',
            } as any,
            {
              collection_type: 'writing',
              config: {},
              description: 'Lore collection',
              id: 'collection-lore',
              is_enabled: true,
              slug: 'lore-capsules',
              title: 'Lore Capsules',
              ws_id: 'ws_123',
            } as any,
          ],
          entries: [
            {
              collection_id: 'collection-sections',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'entry-writing',
              metadata: {},
              profile_data: {
                featuredLoreSlugs: ['first-lore'],
              },
              published_at: null,
              scheduled_for: null,
              slug: 'writing',
              status: 'draft',
              subtitle: 'Section subtitle',
              summary: 'Summary',
              title: 'Writing',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
            {
              collection_id: 'collection-lore',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'lore-1',
              metadata: {},
              profile_data: {},
              published_at: null,
              scheduled_for: null,
              slug: 'first-lore',
              status: 'published',
              subtitle: 'First lore subtitle',
              summary: 'First lore summary',
              title: 'First Lore',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
            {
              collection_id: 'collection-lore',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'lore-2',
              metadata: {},
              profile_data: {},
              published_at: null,
              scheduled_for: null,
              slug: 'second-lore',
              status: 'published',
              subtitle: 'Second lore subtitle',
              summary: 'Second lore summary',
              title: 'Second Lore',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
          ],
          importJobs: [],
          loadingData: null,
          publishEvents: [],
        }}
        strings={strings}
        workspaceId="ws_123"
      />,
      { wrapper }
    );
  }

  function renderClientWithArtworkPlacement({
    includeSectionEntry = true,
  }: {
    includeSectionEntry?: boolean;
  } = {}) {
    render(
      <EntryDetailClient
        binding={
          {
            adapter: 'yoola',
            canonical_id: 'project-1',
            canonical_project: {
              adapter: 'yoola',
              allowed_collections: ['singleton-sections', 'artworks'],
              allowed_features: [],
              delivery_profile: {},
              display_name: 'Yoola',
              id: 'project-1',
              is_active: true,
              metadata: {},
            },
            enabled: true,
          } as any
        }
        entryId="artwork-2"
        initialStudio={{
          assets: [],
          blocks: [],
          collections: [
            {
              collection_type: 'singleton-sections',
              config: {},
              description: 'Singleton sections',
              id: 'collection-sections',
              is_enabled: true,
              slug: 'singleton-sections',
              title: 'Singleton sections',
              ws_id: 'ws_123',
            } as any,
            {
              collection_type: 'artworks',
              config: {},
              description: 'Artwork collection',
              id: 'collection-artworks',
              is_enabled: true,
              slug: 'artworks',
              title: 'Artworks',
              ws_id: 'ws_123',
            } as any,
          ],
          entries: [
            ...(includeSectionEntry
              ? [
                  {
                    collection_id: 'collection-sections',
                    created_at: '2026-04-19T00:00:00.000Z',
                    created_by: null,
                    id: 'entry-gallery',
                    metadata: {},
                    profile_data: {
                      featuredArtworkSlugs: ['featured-one'],
                    },
                    published_at: null,
                    scheduled_for: null,
                    slug: 'gallery',
                    status: 'draft',
                    subtitle: 'Section subtitle',
                    summary: 'Summary',
                    title: 'Gallery',
                    updated_at: '2026-04-19T00:00:00.000Z',
                    updated_by: null,
                    ws_id: 'ws_123',
                  } as any,
                ]
              : []),
            {
              collection_id: 'collection-artworks',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'artwork-1',
              metadata: {},
              profile_data: {},
              published_at: null,
              scheduled_for: null,
              slug: 'featured-one',
              status: 'published',
              subtitle: 'First artwork subtitle',
              summary: 'First artwork summary',
              title: 'Featured One',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
            {
              collection_id: 'collection-artworks',
              created_at: '2026-04-19T00:00:00.000Z',
              created_by: null,
              id: 'artwork-2',
              metadata: {},
              profile_data: {},
              published_at: null,
              scheduled_for: null,
              slug: 'fenomeno-1',
              status: 'published',
              subtitle: 'Second artwork subtitle',
              summary: 'Second artwork summary',
              title: 'Fenomeno 1',
              updated_at: '2026-04-19T00:00:00.000Z',
              updated_by: null,
              ws_id: 'ws_123',
            } as any,
          ],
          importJobs: [],
          loadingData: null,
          publishEvents: [],
        }}
        strings={strings}
        workspaceId="ws_123"
      />,
      { wrapper }
    );
  }

  it('saves entry edits from the dedicated details page', async () => {
    renderClient();

    fireEvent.change(screen.getByLabelText('epm.title_label'), {
      target: { value: 'Updated title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'epm.save_action' }));

    await waitFor(() => {
      expect(updateWorkspaceExternalProjectEntryMock).toHaveBeenCalledWith(
        'ws_123',
        'entry-1',
        expect.objectContaining({
          slug: 'entry-one',
          status: 'draft',
          subtitle: 'Subtitle',
          summary: 'Summary',
          title: 'Updated title',
        })
      );
    });
  });

  it('persists ordered featured writing entries from the section editor', async () => {
    updateWorkspaceExternalProjectEntryMock.mockResolvedValueOnce({
      collection_id: 'collection-sections',
      created_at: '2026-04-19T00:00:00.000Z',
      created_by: null,
      id: 'entry-writing',
      metadata: {},
      profile_data: {
        featuredEntrySlugs: ['second-lore', 'first-lore'],
      },
      published_at: null,
      scheduled_for: null,
      slug: 'writing',
      status: 'draft',
      subtitle: 'Section subtitle',
      summary: 'Summary',
      title: 'Writing',
      updated_at: '2026-04-19T00:00:00.000Z',
      updated_by: null,
      ws_id: 'ws_123',
    });

    renderClientWithWritingSection();

    fireEvent.click(screen.getByRole('checkbox', { name: /Second Lore/i }));
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'epm.previous_action' })
        .find((button) => !button.hasAttribute('disabled'))!
    );
    fireEvent.click(screen.getByRole('button', { name: 'epm.save_action' }));

    await waitFor(() => {
      expect(updateWorkspaceExternalProjectEntryMock).toHaveBeenCalledWith(
        'ws_123',
        'entry-writing',
        expect.objectContaining({
          profile_data: {
            featuredEntrySlugs: ['second-lore', 'first-lore'],
          },
        })
      );
    });
  });

  it('toggles featured placement directly from an artwork entry page', async () => {
    updateWorkspaceExternalProjectEntryMock.mockResolvedValueOnce({
      collection_id: 'collection-sections',
      created_at: '2026-04-19T00:00:00.000Z',
      created_by: null,
      id: 'entry-gallery',
      metadata: {},
      profile_data: {
        featuredArtworkSlugs: ['featured-one', 'fenomeno-1'],
      },
      published_at: null,
      scheduled_for: null,
      slug: 'gallery',
      status: 'draft',
      subtitle: 'Section subtitle',
      summary: 'Summary',
      title: 'Gallery',
      updated_at: '2026-04-19T00:00:00.000Z',
      updated_by: null,
      ws_id: 'ws_123',
    });

    renderClientWithArtworkPlacement();

    const featuredPlacementActions = screen.getAllByText(
      'epm.featured_placement_add_action'
    );
    const featuredPlacementAction = featuredPlacementActions[0];
    expect(featuredPlacementActions.length).toBeGreaterThan(0);
    if (!featuredPlacementAction) {
      throw new Error('Missing featured placement action');
    }

    const featuredPlacementButton = featuredPlacementAction.closest('button');
    expect(featuredPlacementButton).not.toBeNull();
    fireEvent.click(featuredPlacementButton as HTMLButtonElement);

    await waitFor(() => {
      expect(updateWorkspaceExternalProjectEntryMock).toHaveBeenCalledWith(
        'ws_123',
        'entry-gallery',
        {
          profile_data: {
            featuredArtworkSlugs: ['featured-one', 'fenomeno-1'],
          },
        }
      );
    });
  });

  it('creates the missing config entry directly from the featured placement card', async () => {
    createWorkspaceExternalProjectEntryMock.mockResolvedValueOnce({
      collection_id: 'collection-sections',
      created_at: '2026-04-19T00:00:00.000Z',
      created_by: null,
      id: 'entry-gallery',
      metadata: {},
      profile_data: {
        featuredArtworkSlugs: ['fenomeno-1'],
      },
      published_at: null,
      scheduled_for: null,
      slug: 'gallery',
      status: 'draft',
      subtitle: null,
      summary: null,
      title: 'Gallery',
      updated_at: '2026-04-19T00:00:00.000Z',
      updated_by: null,
      ws_id: 'ws_123',
    });

    renderClientWithArtworkPlacement({ includeSectionEntry: false });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'epm.featured_placement_create_action',
      })
    );

    await waitFor(() => {
      expect(createWorkspaceExternalProjectEntryMock).toHaveBeenCalledWith(
        'ws_123',
        {
          collection_id: 'collection-sections',
          metadata: {},
          profile_data: {
            featuredArtworkSlugs: ['fenomeno-1'],
          },
          slug: 'gallery',
          status: 'draft',
          subtitle: null,
          summary: null,
          title: 'Gallery',
        }
      );
    });
  });

  it('uploads a new cover as a first-class image asset', async () => {
    renderClient();

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['cover'], 'cover.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(optimizeEpmMediaUploadMock).toHaveBeenCalledWith(expect.any(File));
      expect(uploadWorkspaceExternalProjectAssetFileMock).toHaveBeenCalledWith(
        'ws_123',
        expect.any(File),
        {
          collectionType: 'artworks',
          entrySlug: 'entry-one',
          upsert: true,
        }
      );
      expect(createWorkspaceExternalProjectAssetMock).toHaveBeenCalledWith(
        'ws_123',
        expect.objectContaining({
          alt_text: 'Entry One',
          asset_type: 'image',
          entry_id: 'entry-1',
          sort_order: 0,
          storage_path: 'covers/cover.png',
        })
      );
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: ['epm-studio', 'ws_123'],
      });
    });
  });

  it('quick deletes an individual image from the entry gallery', async () => {
    renderClientWithAssets();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'epm.remove_media_action' })[1]!
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'epm.remove_media_action' })
    );

    await waitFor(() => {
      expect(deleteWorkspaceExternalProjectAssetMock).toHaveBeenCalledWith(
        'ws_123',
        'asset-2'
      );
    });
  });

  it('saves captions for individual media items', async () => {
    updateWorkspaceExternalProjectAssetMock.mockResolvedValue({
      alt_text: 'Alt asset',
      asset_type: 'image',
      asset_url: 'https://cdn.example.com/detail.png',
      block_id: null,
      created_at: '2026-04-19T00:00:00.000Z',
      entry_id: 'entry-1',
      id: 'asset-2',
      metadata: {
        caption: 'Updated caption',
      },
      preview_url: 'https://cdn.example.com/detail-preview.png',
      sort_order: 1,
      source_url: null,
      storage_path: 'details/detail.png',
      updated_at: '2026-04-19T00:00:00.000Z',
      ws_id: 'ws_123',
    });

    renderClientWithAssets();

    fireEvent.change(screen.getAllByLabelText('epm.caption_label')[1]!, {
      target: { value: 'Updated caption' },
    });
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'epm.save_media_details_action',
      })[0]!
    );

    await waitFor(() => {
      expect(updateWorkspaceExternalProjectAssetMock).toHaveBeenCalledWith(
        'ws_123',
        'asset-2',
        expect.objectContaining({
          metadata: {
            caption: 'Updated caption',
          },
        })
      );
    });
  });

  it('shows a processing indicator while media uploads are still running', async () => {
    let resolveAsset:
      | ((
          value: Awaited<
            ReturnType<typeof createWorkspaceExternalProjectAssetMock>
          >
        ) => void)
      | undefined;
    const pendingAsset = new Promise<
      Awaited<ReturnType<typeof createWorkspaceExternalProjectAssetMock>>
    >((resolve) => {
      resolveAsset = resolve;
    });

    createWorkspaceExternalProjectAssetMock.mockImplementationOnce(
      () => pendingAsset
    );

    renderClient();

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['cover'], 'cover.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText('epm.media_processing_label').length).toBe(3);
    });

    resolveAsset?.({
      alt_text: 'Entry One',
      asset_type: 'image',
      asset_url: 'https://cdn.example.com/cover.png',
      block_id: null,
      created_at: '2026-04-19T00:00:00.000Z',
      entry_id: 'entry-1',
      id: 'asset-1',
      metadata: {},
      preview_url: 'https://cdn.example.com/cover-preview.png',
      sort_order: 0,
      source_url: null,
      storage_path: 'covers/cover.png',
      updated_at: '2026-04-19T00:00:00.000Z',
      ws_id: 'ws_123',
    });

    await waitFor(() => {
      expect(
        screen.queryByText('epm.media_processing_label')
      ).not.toBeInTheDocument();
    });
  });
});
