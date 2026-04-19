import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEpmStrings } from '../../epm-strings';
import { CollectionDetailClient } from './collection-detail-client';

const {
  createWorkspaceExternalProjectEntryMock,
  routerPushMock,
  routerRefreshMock,
  updateWorkspaceExternalProjectCollectionMock,
} = vi.hoisted(() => ({
  createWorkspaceExternalProjectEntryMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  updateWorkspaceExternalProjectCollectionMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceExternalProjectEntry: createWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectCollection:
    updateWorkspaceExternalProjectCollectionMock,
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
  usePathname: () => '/ws_123/epm/collections/collection-1',
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

describe('CollectionDetailClient', () => {
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
    vi.clearAllMocks();

    updateWorkspaceExternalProjectCollectionMock.mockResolvedValue({
      collection_type: 'artworks',
      config: {},
      description: 'Updated description',
      id: 'collection-1',
      is_enabled: false,
      slug: 'artworks',
      title: 'Updated artworks',
      ws_id: 'ws_123',
    });
    createWorkspaceExternalProjectEntryMock.mockResolvedValue({
      collection_id: 'collection-1',
      created_at: '2026-04-19T00:00:00.000Z',
      created_by: null,
      id: 'entry-2',
      metadata: {},
      profile_data: {},
      published_at: null,
      scheduled_for: null,
      slug: 'draft-2',
      status: 'draft',
      subtitle: null,
      summary: null,
      title: 'Untitled entry',
      updated_at: '2026-04-19T00:00:00.000Z',
      updated_by: null,
      ws_id: 'ws_123',
    });
  });

  function renderClient() {
    render(
      <CollectionDetailClient
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
        collectionId="collection-1"
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

  it('saves collection settings on the dedicated detail page', async () => {
    renderClient();

    fireEvent.change(screen.getByLabelText('epm.title_label'), {
      target: { value: 'Updated artworks' },
    });
    fireEvent.change(screen.getByLabelText('epm.description_label'), {
      target: { value: 'Updated description' },
    });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'epm.save_action' }));

    await waitFor(() => {
      expect(updateWorkspaceExternalProjectCollectionMock).toHaveBeenCalledWith(
        'ws_123',
        'collection-1',
        {
          description: 'Updated description',
          is_enabled: false,
          title: 'Updated artworks',
        }
      );
    });
  });

  it('quick-creates entries from the collection page and routes into details', async () => {
    renderClient();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'epm.create_entry_action' })[0]!
    );

    await waitFor(() => {
      expect(createWorkspaceExternalProjectEntryMock).toHaveBeenCalledWith(
        'ws_123',
        expect.objectContaining({
          collection_id: 'collection-1',
          status: 'draft',
          title: 'Untitled entry',
        })
      );
    });

    expect(routerPushMock).toHaveBeenCalledWith('/ws_123/epm/entries/entry-2');
  });
});
