import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpmClient } from './epm-client';

const {
  bulkUpdateWorkspaceExternalProjectEntriesMock,
  createWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntryMock,
  getWorkspaceExternalProjectDeliveryMock,
  importWorkspaceExternalProjectContentMock,
  publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectCollectionMock,
  updateWorkspaceExternalProjectEntryMock,
} = vi.hoisted(() => ({
  bulkUpdateWorkspaceExternalProjectEntriesMock: vi.fn(),
  createWorkspaceExternalProjectEntryMock: vi.fn(),
  duplicateWorkspaceExternalProjectEntryMock: vi.fn(),
  getWorkspaceExternalProjectDeliveryMock: vi.fn(),
  importWorkspaceExternalProjectContentMock: vi.fn(),
  publishWorkspaceExternalProjectEntryMock: vi.fn(),
  updateWorkspaceExternalProjectCollectionMock: vi.fn(),
  updateWorkspaceExternalProjectEntryMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  bulkUpdateWorkspaceExternalProjectEntries:
    bulkUpdateWorkspaceExternalProjectEntriesMock,
  createWorkspaceExternalProjectEntry: createWorkspaceExternalProjectEntryMock,
  duplicateWorkspaceExternalProjectEntry:
    duplicateWorkspaceExternalProjectEntryMock,
  getWorkspaceExternalProjectDelivery: getWorkspaceExternalProjectDeliveryMock,
  importWorkspaceExternalProjectContent:
    importWorkspaceExternalProjectContentMock,
  publishWorkspaceExternalProjectEntry:
    publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectCollection:
    updateWorkspaceExternalProjectCollectionMock,
  updateWorkspaceExternalProjectEntry: updateWorkspaceExternalProjectEntryMock,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

describe('EpmClient', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const strings = {
    activityTab: 'Activity',
    archivedQueue: 'Archived backlog',
    archiveAction: 'Archive',
    archiveBacklogHint: 'hint',
    attentionTitle: 'Attention Queue',
    bulkActionsTitle: 'Workflow Queues',
    bulkSelectionHint: 'bulk hint',
    cancelAction: 'Cancel',
    collectionFallbackLabel: 'Collection',
    collectionsLabel: 'Collections',
    collectionsMetricLabel: 'Collections',
    contentTab: 'Content',
    createEntryAction: 'Quick create',
    draftQueue: 'Draft queue',
    duplicateAction: 'Duplicate',
    editCollectionAction: 'Edit collection',
    editEntryAction: 'Edit details',
    editEntryDescription: 'Edit description',
    editEntryTitle: 'Entry editor',
    emptyCollection: 'No collection',
    emptyEntries: 'No entries',
    enabledLabel: 'Enabled',
    entriesMetricLabel: 'Entries',
    entrySummaryTitle: 'Selected entry',
    filterAll: 'All',
    importAction: 'Import',
    importHint: 'Import hint',
    loadingPreviewLabel: 'Loading preview payload...',
    metadataLabel: 'Metadata JSON',
    missingLeadImageLabel: 'Missing a lead image asset.',
    noAdapterLabel: 'No adapter',
    noCanonicalIdLabel: 'No canonical id',
    noneLabel: 'None',
    notScheduledLabel: 'Not scheduled',
    openPreviewAction: 'Open preview',
    overviewTab: 'Overview',
    payloadLabel: 'Payload',
    previewDescription: 'Preview description',
    previewTitle: 'On-demand preview',
    profileDataLabel: 'Profile data JSON',
    publishedQueue: 'Recently imported, not published',
    publishAction: 'Publish',
    quickCreateHint: 'Quick create hint',
    recentUnpublishedHint: 'Imported recently but still unpublished.',
    recoveryHint: 'Ready for cleanup or recovery.',
    refreshAction: 'Refresh workspace',
    renderedLabel: 'Rendered',
    saveAction: 'Save',
    scheduleAction: 'Schedule',
    scheduledForLabel: 'Scheduled for',
    scheduledQueue: 'Scheduled soon',
    searchPlaceholder: 'Search',
    settingsTab: 'Settings',
    statusArchived: 'Archived',
    statusDraft: 'Draft',
    statusPublished: 'Published',
    statusScheduled: 'Scheduled',
    subtitleLabel: 'Subtitle',
    summaryLabel: 'Summary',
    tabsDescription: 'Description',
    title: 'EPM',
    titleLabel: 'Title',
    unboundLabel: 'Unbound',
    unknownCollectionLabel: 'Unknown collection',
    unpublishAction: 'Unpublish',
    workflowTab: 'Workflow',
    workspaceBindingLabel: 'Workspace binding',
  } as const;

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
          description: null,
          entries: [
            {
              assets: [],
              blocks: [],
              id: 'entry-1',
              metadata: {},
              profile_data: {},
              published_at: null,
              slug: 'entry-one',
              status: 'draft',
              subtitle: null,
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
      profileData: {},
      workspaceId: 'ws_123',
    });
    bulkUpdateWorkspaceExternalProjectEntriesMock.mockResolvedValue([
      {
        collection_id: 'collection-1',
        created_at: '',
        created_by: null,
        id: 'entry-1',
        metadata: {},
        profile_data: {},
        published_at: null,
        scheduled_for: null,
        slug: 'entry-one',
        status: 'published',
        subtitle: null,
        summary: 'Summary',
        title: 'Entry One',
        updated_at: '',
        updated_by: null,
        ws_id: 'ws_123',
      },
    ]);
  });

  it('switches tabs and opens the explicit editor dialog', async () => {
    render(
      <EpmClient
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
        initialTab="content"
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

    expect(screen.getByText('Selected entry')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit details/i }));

    expect(screen.getByText('Entry editor')).toBeInTheDocument();
  });

  it('keeps preview on demand and loads it only when requested', async () => {
    render(
      <EpmClient
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
              subtitle: null,
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

    expect(getWorkspaceExternalProjectDeliveryMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open preview/i }));

    await waitFor(() => {
      expect(getWorkspaceExternalProjectDeliveryMock).toHaveBeenCalledWith(
        'ws_123',
        true,
        expect.any(Object)
      );
    });
  });

  it('sends bulk publish actions from the workflow tab', async () => {
    render(
      <EpmClient
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
        initialTab="workflow"
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
              subtitle: null,
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

    expect(screen.getByText('Workflow Queues')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]!);

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
