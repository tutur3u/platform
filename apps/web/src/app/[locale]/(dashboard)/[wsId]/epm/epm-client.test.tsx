import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpmClient } from './epm-client';
import { buildEpmStrings } from './epm-strings';

const {
  bulkUpdateWorkspaceExternalProjectEntriesMock,
  createWorkspaceExternalProjectCollectionMock,
  createWorkspaceExternalProjectEntryMock,
  deleteWorkspaceExternalProjectCollectionMock,
  deleteWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntryMock,
  getWorkspaceExternalProjectDeliveryMock,
  importWorkspaceExternalProjectContentMock,
  publishWorkspaceExternalProjectEntryMock,
  routerPushMock,
  routerRefreshMock,
} = vi.hoisted(() => ({
  bulkUpdateWorkspaceExternalProjectEntriesMock: vi.fn(),
  createWorkspaceExternalProjectCollectionMock: vi.fn(),
  createWorkspaceExternalProjectEntryMock: vi.fn(),
  deleteWorkspaceExternalProjectCollectionMock: vi.fn(),
  deleteWorkspaceExternalProjectEntryMock: vi.fn(),
  duplicateWorkspaceExternalProjectEntryMock: vi.fn(),
  getWorkspaceExternalProjectDeliveryMock: vi.fn(),
  importWorkspaceExternalProjectContentMock: vi.fn(),
  publishWorkspaceExternalProjectEntryMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  bulkUpdateWorkspaceExternalProjectEntries:
    bulkUpdateWorkspaceExternalProjectEntriesMock,
  createWorkspaceExternalProjectCollection:
    createWorkspaceExternalProjectCollectionMock,
  createWorkspaceExternalProjectEntry: createWorkspaceExternalProjectEntryMock,
  deleteWorkspaceExternalProjectCollection:
    deleteWorkspaceExternalProjectCollectionMock,
  deleteWorkspaceExternalProjectEntry: deleteWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntry:
    duplicateWorkspaceExternalProjectEntryMock,
  getWorkspaceExternalProjectDelivery: getWorkspaceExternalProjectDeliveryMock,
  importWorkspaceExternalProjectContent:
    importWorkspaceExternalProjectContentMock,
  publishWorkspaceExternalProjectEntry:
    publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectAsset: vi.fn(),
  updateWorkspaceExternalProjectEntry: vi.fn(),
  uploadWorkspaceExternalProjectAssetFile: vi.fn(),
  createWorkspaceExternalProjectAsset: vi.fn(),
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
  usePathname: () => '/ws_123/epm',
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

describe('EpmClient', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const strings = buildEpmStrings((key) => key);

  const binding = {
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
  } as any;

  const studio = {
    assets: [
      {
        alt_text: 'Entry cover',
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
      },
    ],
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
    publishEvents: [
      {
        created_at: '2026-04-19T00:00:00.000Z',
        entry_id: 'entry-1',
        event_kind: 'publish',
        id: 'event-1',
        ws_id: 'ws_123',
      },
    ],
  } as any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
      },
    });
    vi.clearAllMocks();

    getWorkspaceExternalProjectDeliveryMock.mockResolvedValue({
      adapter: 'yoola',
      canonicalProjectId: 'project-1',
      collections: [
        {
          collection_type: 'artworks',
          config: {},
          description: 'Preview collection',
          entries: [
            {
              assets: [
                {
                  alt_text: 'Preview cover',
                  assetUrl: 'https://cdn.example.com/preview-cover.png',
                  asset_type: 'image',
                  id: 'delivery-asset-1',
                  metadata: {},
                },
              ],
              blocks: [
                {
                  block_type: 'markdown',
                  content: { markdown: 'Rendered from preview payload.' },
                  id: 'block-1',
                  title: 'Overview',
                },
              ],
              id: 'entry-1',
              metadata: {},
              profile_data: {},
              published_at: null,
              slug: 'entry-one',
              status: 'draft',
              subtitle: 'Preview subtitle',
              summary: 'Preview summary',
              title: 'Entry One',
            },
          ],
          id: 'collection-1',
          slug: 'artworks',
          title: 'Artworks',
        },
      ],
      generatedAt: '2026-04-19T00:00:00.000Z',
      loadingData: null,
      profileData: { brand: 'Yoola' },
      workspaceId: 'ws_123',
    });
    bulkUpdateWorkspaceExternalProjectEntriesMock.mockResolvedValue([
      {
        ...studio.entries[0],
        status: 'published',
      },
    ]);
  });

  function renderClient(props?: Partial<Parameters<typeof EpmClient>[0]>) {
    render(
      <EpmClient
        binding={binding}
        initialStudio={studio}
        strings={strings}
        workspaceId="ws_123"
        {...props}
      />,
      { wrapper }
    );
  }

  it('defaults to preview mode and renders delivery-backed content', async () => {
    renderClient();

    await waitFor(() => {
      expect(getWorkspaceExternalProjectDeliveryMock).toHaveBeenCalledWith(
        'ws_123',
        true,
        expect.any(Object)
      );
    });

    expect(await screen.findByText('Preview summary')).toBeInTheDocument();
    expect(
      screen.queryByText('epm.bulk_actions_title')
    ).not.toBeInTheDocument();
  });

  it('shows workflow queues only in edit mode', async () => {
    renderClient({ initialEditSection: 'workflow', initialMode: 'edit' });

    expect(screen.getByText('epm.schedule_action')).toBeInTheDocument();
    expect(
      screen.queryByText('Rendered from preview payload.')
    ).not.toBeInTheDocument();
  });

  it('opens the fullscreen entry editor dialog from the gallery', async () => {
    renderClient({ initialMode: 'edit' });

    fireEvent.click(screen.getByText('Entry One'));

    expect(await screen.findByText('epm.details_title')).toBeInTheDocument();
  });

  it('routes collection actions to the dedicated collection page', async () => {
    renderClient({ initialEditSection: 'settings', initialMode: 'edit' });
    fireEvent.click(
      screen.getByRole('button', { name: 'epm.open_collection_action' })
    );

    expect(routerPushMock).toHaveBeenCalledWith(
      '/ws_123/epm/collections/collection-1'
    );
  });

  it('sends bulk publish actions from the workflow section', async () => {
    renderClient({ initialEditSection: 'workflow', initialMode: 'edit' });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'epm.publish_action' })[0]!
    );

    await waitFor(() => {
      expect(
        bulkUpdateWorkspaceExternalProjectEntriesMock
      ).toHaveBeenCalledWith('ws_123', {
        action: 'publish',
        entryIds: ['entry-1'],
        scheduledFor: undefined,
        status: undefined,
      });
    });
  });
});
