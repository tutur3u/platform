import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEpmStrings } from '../../epm-strings';
import { EntryDetailClient } from './entry-detail-client';

const {
  createWorkspaceExternalProjectAssetMock,
  deleteWorkspaceExternalProjectAssetMock,
  deleteWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntryMock,
  invalidateQueriesMock,
  publishWorkspaceExternalProjectEntryMock,
  routerPushMock,
  routerRefreshMock,
  updateWorkspaceExternalProjectAssetMock,
  updateWorkspaceExternalProjectEntryMock,
  optimizeEpmMediaUploadMock,
  uploadWorkspaceExternalProjectAssetFileMock,
} = vi.hoisted(() => ({
  createWorkspaceExternalProjectAssetMock: vi.fn(),
  deleteWorkspaceExternalProjectAssetMock: vi.fn(),
  deleteWorkspaceExternalProjectEntryMock: vi.fn(),
  duplicateWorkspaceExternalProjectEntryMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  optimizeEpmMediaUploadMock: vi.fn(),
  publishWorkspaceExternalProjectEntryMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  updateWorkspaceExternalProjectAssetMock: vi.fn(),
  updateWorkspaceExternalProjectEntryMock: vi.fn(),
  uploadWorkspaceExternalProjectAssetFileMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceExternalProjectAsset: createWorkspaceExternalProjectAssetMock,
  deleteWorkspaceExternalProjectAsset: deleteWorkspaceExternalProjectAssetMock,
  deleteWorkspaceExternalProjectEntry: deleteWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntry:
    duplicateWorkspaceExternalProjectEntryMock,
  publishWorkspaceExternalProjectEntry:
    publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectAsset: updateWorkspaceExternalProjectAssetMock,
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
