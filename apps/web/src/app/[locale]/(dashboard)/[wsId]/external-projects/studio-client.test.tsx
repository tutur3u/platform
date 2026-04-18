import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalProjectStudioClient } from './studio-client';

const {
  createWorkspaceExternalProjectAssetMock,
  createWorkspaceExternalProjectBlockMock,
  createWorkspaceExternalProjectEntryMock,
  getWorkspaceExternalProjectDeliveryMock,
  getWorkspaceExternalProjectStudioMock,
  importWorkspaceExternalProjectContentMock,
  publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectAssetMock,
  updateWorkspaceExternalProjectBlockMock,
  updateWorkspaceExternalProjectCollectionMock,
  updateWorkspaceExternalProjectEntryMock,
  uploadWorkspaceExternalProjectAssetFileMock,
} = vi.hoisted(() => ({
  createWorkspaceExternalProjectAssetMock: vi.fn(),
  createWorkspaceExternalProjectBlockMock: vi.fn(),
  createWorkspaceExternalProjectEntryMock: vi.fn(),
  getWorkspaceExternalProjectDeliveryMock: vi.fn(),
  getWorkspaceExternalProjectStudioMock: vi.fn(),
  importWorkspaceExternalProjectContentMock: vi.fn(),
  publishWorkspaceExternalProjectEntryMock: vi.fn(),
  updateWorkspaceExternalProjectAssetMock: vi.fn(),
  updateWorkspaceExternalProjectBlockMock: vi.fn(),
  updateWorkspaceExternalProjectCollectionMock: vi.fn(),
  updateWorkspaceExternalProjectEntryMock: vi.fn(),
  uploadWorkspaceExternalProjectAssetFileMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceExternalProjectAsset: createWorkspaceExternalProjectAssetMock,
  createWorkspaceExternalProjectBlock: createWorkspaceExternalProjectBlockMock,
  createWorkspaceExternalProjectEntry: createWorkspaceExternalProjectEntryMock,
  getWorkspaceExternalProjectDelivery: getWorkspaceExternalProjectDeliveryMock,
  getWorkspaceExternalProjectStudio: getWorkspaceExternalProjectStudioMock,
  importWorkspaceExternalProjectContent:
    importWorkspaceExternalProjectContentMock,
  publishWorkspaceExternalProjectEntry:
    publishWorkspaceExternalProjectEntryMock,
  updateWorkspaceExternalProjectAsset: updateWorkspaceExternalProjectAssetMock,
  updateWorkspaceExternalProjectBlock: updateWorkspaceExternalProjectBlockMock,
  updateWorkspaceExternalProjectCollection:
    updateWorkspaceExternalProjectCollectionMock,
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
    refresh: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

describe('ExternalProjectStudioClient', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

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
      collections: [],
      generatedAt: '2026-04-18T00:00:00.000Z',
      loadingData: null,
      profileData: {},
      workspaceId: 'ws_123',
    });
  });

  it('renders the split-view studio and switches preview tabs', async () => {
    render(
      <ExternalProjectStudioClient
        assets={[
          {
            alt_text: 'Artwork alt',
            asset_type: 'image',
            asset_url: '/art.png',
            block_id: null,
            created_at: '',
            created_by: null,
            entry_id: 'entry-1',
            id: 'asset-1',
            metadata: {},
            preview_url: '/art.png',
            sort_order: 0,
            source_url: null,
            storage_path: 'external-projects/yoola/artworks/1.png',
            updated_at: '',
            updated_by: null,
            ws_id: 'ws_123',
          } as any,
        ]}
        binding={
          {
            adapter: 'yoola',
            canonical_id: 'project-1',
            canonical_project: {
              adapter: 'yoola',
              allowed_collections: [
                'artworks',
                'lore-capsules',
                'singleton-sections',
              ],
              allowed_features: [],
              delivery_profile: {},
              display_name: 'Yoola Archive',
              id: 'project-1',
              is_active: true,
              metadata: {},
            },
            enabled: true,
          } as any
        }
        blocks={[]}
        collections={[
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
        ]}
        entries={[
          {
            collection_id: 'collection-1',
            created_at: '',
            created_by: null,
            id: 'entry-1',
            metadata: {},
            profile_data: {
              category: 'SPEED',
              label: 'Featured',
              orientation: 'Landscape',
              rarity: 'R',
              year: '2026',
            },
            slug: 'artwork-1',
            status: 'draft',
            subtitle: null,
            summary: 'A summary',
            title: 'Artwork One',
            updated_at: '',
            updated_by: null,
            ws_id: 'ws_123',
          } as any,
        ]}
        importJobs={[]}
        loadingData={{
          adapter: 'yoola',
          artworkCategories: ['SPEED'],
          artworks: [],
          artworksByCategory: {},
          featuredArtwork: null,
          loreCapsules: [],
          singletonSections: {},
        }}
        publishEvents={[]}
        strings={{
          actionFailedToast: 'failed',
          activityDescription: 'activity',
          activityTab: 'Activity',
          adapterBlueprintLabel: 'Blueprint',
          assetMetadataLabel: 'Asset metadata',
          addArtwork: 'New artwork',
          addEntry: 'Add entry',
          addLoreCapsule: 'New lore',
          addSection: 'New section',
          allItemsLabel: 'All',
          assetPathLabel: 'Asset path',
          artworkLinkLabel: 'Artwork link',
          artworksTab: 'Artworks',
          bodyLabel: 'Body',
          categoryLabel: 'Category',
          channelLabel: 'Channel',
          collectionDisabledLabel: 'Disabled',
          collectionEmptyDescription: 'Empty',
          collectionEmptyTitle: 'No content',
          collectionEnabledLabel: 'Enabled',
          collectionsMetricLabel: 'Collections',
          collectionsTitle: 'Collections',
          collectionSelectLabel: 'Collection',
          collectionSettingsDescription: 'Collection settings',
          collectionSettingsTitle: 'Collection settings',
          contentRailDescription: 'Content rail',
          contentRailTitle: 'Content rail',
          contentTab: 'Content',
          dateLabel: 'Date',
          deliveryPreviewDescription: 'Preview description',
          deliveryPreviewTitle: 'Preview',
          descriptionLabel: 'Description',
          detailPanelDescription: 'Editor description',
          detailPanelTitle: 'Editor',
          dirtyChangesLabel: 'Unsaved',
          draftBadge: 'Draft',
          draftsMetricLabel: 'Drafts',
          emptyPreviewDescription: 'Select an item',
          emptyPreviewTitle: 'Preview waiting',
          entriesMetricLabel: 'Entries',
          entryFormDescription: 'Entry form',
          entryMetadataLabel: 'Entry metadata',
          excerptLabel: 'Excerpt',
          featuredArtworkLabel: 'Featured',
          heightLabel: 'Height',
          imageAltLabel: 'Image alt',
          importAction: 'Import',
          importCompleteToast: 'Imported',
          importJobsEmpty: 'No imports',
          importJobsTitle: 'Import jobs',
          invalidJsonLabel: 'Invalid JSON',
          labelLabel: 'Label',
          linkedArtworkMissingDescription: 'No linked artwork',
          loreQueueLabel: 'Lore queue',
          loreTab: 'Lore',
          mediaDescription: 'Media description',
          mediaSectionTitle: 'Media',
          noAdapterEditorDescription: 'No adapter',
          noAdapterEditorTitle: 'No adapter title',
          noImageDescription: 'No image',
          noImageTitle: 'No image',
          noItemsDescription: 'No items',
          noItemsTitle: 'No items',
          noSearchResultsDescription: 'No search results',
          noSearchResultsTitle: 'No results',
          noteLabel: 'Note',
          notAvailableLabel: 'N/A',
          openPreviewAction: 'Open preview',
          operationsDescription: 'Operations',
          orientationLabel: 'Orientation',
          payloadSectionsLabel: 'Payload sections',
          payloadTabLabel: 'Payload',
          pendingLabel: 'Pending',
          previewErrorDescription: 'Preview error',
          previewErrorTitle: 'Preview unavailable',
          previewLoadingLabel: 'Loading preview...',
          profileDataLabel: 'Profile JSON',
          profileLabel: 'Records',
          publish: 'Publish',
          publishEventsEmpty: 'No publish events',
          publishEventsTitle: 'Publish events',
          publishedBadge: 'Published',
          publishedMetricLabel: 'Published',
          rarityLabel: 'Rarity',
          refreshHint: 'Refresh hint',
          remoteSourceLabel: 'Remote source',
          renderedTabLabel: 'Rendered',
          saveChanges: 'Save',
          saveSuccessToast: 'Saved',
          savingLabel: 'Saving',
          searchPlaceholder: 'Search',
          sectionBodyLabel: 'Section body',
          sectionsLabel: 'Sections',
          sectionsTab: 'Sections',
          slugLabel: 'Slug',
          statusLabel: 'Status',
          studioActionDescription: 'Action description',
          studioTitle: 'Studio',
          subtitleLabel: 'Subtitle',
          summaryDescription: 'Summary',
          summaryLabel: 'Summary',
          tagsLabel: 'Tags',
          teaserLabel: 'Teaser',
          titleLabel: 'Title',
          typeLabel: 'Type',
          unpublish: 'Unpublish',
          uploadAction: 'Upload',
          uploadCompleteToast: 'Uploaded',
          widthLabel: 'Width',
          yearLabel: 'Year',
        }}
        workspaceId="ws_123"
      />,
      { wrapper }
    );

    expect(screen.getAllByText('Content rail').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Editor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rendered').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Payload' }));

    await waitFor(() =>
      expect(getWorkspaceExternalProjectDeliveryMock).toHaveBeenCalled()
    );
    expect(screen.getByText('Preview description')).toBeInTheDocument();
  });
});
