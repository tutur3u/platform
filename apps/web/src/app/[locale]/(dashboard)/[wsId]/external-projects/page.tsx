import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  hasRootExternalProjectsAdminPermission,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import { getWorkspaceExternalProjectStudioData } from '@/lib/external-projects/store';
import { ExternalProjectStudioClient } from './studio-client';

export const metadata: Metadata = {
  title: 'External Project Studio',
  description:
    'Manage content for canonical external projects that are bound to this workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function ExternalProjectStudioPage({ params }: Props) {
  const { wsId: rawWsId } = await params;
  const supabase = await createClient();
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const [workspacePermissions, rootPermissions, binding] = await Promise.all([
    getPermissions({ wsId: rawWsId }),
    getPermissions({ wsId: ROOT_WORKSPACE_ID }),
    resolveWorkspaceExternalProjectBinding(wsId),
  ]);

  const canAccess =
    workspacePermissions?.containsPermission('manage_external_projects') ||
    workspacePermissions?.containsPermission('publish_external_projects') ||
    hasRootExternalProjectsAdminPermission(rootPermissions);

  if (!canAccess) {
    redirect(`/${rawWsId}`);
  }

  if (!binding.enabled || !binding.canonical_project) {
    notFound();
  }

  const t = await getTranslations('external-projects');
  const studio = await getWorkspaceExternalProjectStudioData(wsId);

  return (
    <ExternalProjectStudioClient
      assets={studio.assets}
      binding={binding}
      blocks={studio.blocks}
      collections={studio.collections}
      entries={studio.entries}
      importJobs={studio.importJobs}
      loadingData={studio.loadingData}
      publishEvents={studio.publishEvents}
      strings={{
        actionFailedToast: t('studio.action_failed_toast'),
        activityDescription: t('studio.activity_description'),
        activityTab: t('studio.activity_tab'),
        adapterBlueprintLabel: t('studio.adapter_blueprint_label'),
        assetMetadataLabel: t('studio.asset_metadata_label'),
        addArtwork: t('studio.add_artwork'),
        addEntry: t('studio.add_entry'),
        addLoreCapsule: t('studio.add_lore_capsule'),
        addSection: t('studio.add_section'),
        allItemsLabel: t('studio.all_items_label'),
        assetPathLabel: t('studio.asset_path_label'),
        artworkLinkLabel: t('studio.artwork_link_label'),
        artworksTab: t('studio.artworks_tab'),
        categoryLabel: t('studio.category_label'),
        channelLabel: t('studio.channel_label'),
        collectionDisabledLabel: t('studio.collection_disabled_label'),
        collectionEmptyDescription: t('studio.collection_empty_description'),
        collectionEmptyTitle: t('studio.collection_empty_title'),
        collectionEnabledLabel: t('studio.collection_enabled_label'),
        collectionsMetricLabel: t('studio.collections_metric_label'),
        collectionsTitle: t('studio.collections_title'),
        collectionSelectLabel: t('studio.collection_select_label'),
        collectionSettingsDescription: t(
          'studio.collection_settings_description'
        ),
        collectionSettingsTitle: t('studio.collection_settings_title'),
        contentRailDescription: t('studio.content_rail_description'),
        contentRailTitle: t('studio.content_rail_title'),
        contentTab: t('studio.content_tab'),
        dateLabel: t('studio.date_label'),
        dirtyChangesLabel: t('studio.dirty_changes_label'),
        deliveryPreviewDescription: t('studio.delivery_preview_description'),
        deliveryPreviewTitle: t('studio.delivery_preview_title'),
        descriptionLabel: t('studio.description_label'),
        detailPanelDescription: t('studio.detail_panel_description'),
        detailPanelTitle: t('studio.detail_panel_title'),
        emptyPreviewDescription: t('studio.empty_preview_description'),
        emptyPreviewTitle: t('studio.empty_preview_title'),
        draftBadge: t('studio.draft_badge'),
        draftsMetricLabel: t('studio.drafts_metric_label'),
        entriesMetricLabel: t('studio.entries_metric_label'),
        entryFormDescription: t('studio.entry_form_description'),
        entryMetadataLabel: t('studio.entry_metadata_label'),
        excerptLabel: t('studio.excerpt_label'),
        featuredArtworkLabel: t('studio.featured_artwork_label'),
        heightLabel: t('studio.height_label'),
        imageAltLabel: t('studio.image_alt_label'),
        importAction: t('studio.import_action'),
        importCompleteToast: t('studio.import_complete_toast'),
        importJobsEmpty: t('studio.import_jobs_empty'),
        importJobsTitle: t('studio.import_jobs_title'),
        invalidJsonLabel: t('studio.invalid_json_label'),
        labelLabel: t('studio.label_label'),
        linkedArtworkMissingDescription: t(
          'studio.linked_artwork_missing_description'
        ),
        loreQueueLabel: t('studio.lore_queue_label'),
        loreTab: t('studio.lore_tab'),
        mediaDescription: t('studio.media_description'),
        mediaSectionTitle: t('studio.media_section_title'),
        noAdapterEditorDescription: t('studio.no_adapter_editor_description'),
        noAdapterEditorTitle: t('studio.no_adapter_editor_title'),
        noImageDescription: t('studio.no_image_description'),
        noImageTitle: t('studio.no_image_title'),
        noItemsDescription: t('studio.no_items_description'),
        noItemsTitle: t('studio.no_items_title'),
        noSearchResultsDescription: t('studio.no_search_results_description'),
        noSearchResultsTitle: t('studio.no_search_results_title'),
        noteLabel: t('studio.note_label'),
        notAvailableLabel: t('studio.not_available_label'),
        openPreviewAction: t('studio.open_preview_action'),
        operationsDescription: t('studio.operations_description'),
        orientationLabel: t('studio.orientation_label'),
        pendingLabel: t('studio.pending_label'),
        payloadTabLabel: t('studio.payload_tab_label'),
        payloadSectionsLabel: t('studio.payload_sections_label'),
        profileLabel: t('studio.profile_label'),
        previewErrorDescription: t('studio.preview_error_description'),
        previewErrorTitle: t('studio.preview_error_title'),
        previewLoadingLabel: t('studio.preview_loading_label'),
        publish: t('studio.publish'),
        publishEventsEmpty: t('studio.publish_events_empty'),
        publishEventsTitle: t('studio.publish_events_title'),
        publishedBadge: t('studio.published_badge'),
        publishedMetricLabel: t('studio.published_metric_label'),
        profileDataLabel: t('studio.profile_data_label'),
        rarityLabel: t('studio.rarity_label'),
        remoteSourceLabel: t('studio.remote_source_label'),
        refreshHint: t('studio.refresh_hint'),
        saveChanges: t('studio.save_changes'),
        saveSuccessToast: t('studio.save_success_toast'),
        savingLabel: t('studio.saving_label'),
        searchPlaceholder: t('studio.search_placeholder'),
        sectionBodyLabel: t('studio.section_body_label'),
        sectionsLabel: t('studio.sections_label'),
        sectionsTab: t('studio.sections_tab'),
        renderedTabLabel: t('studio.rendered_tab_label'),
        slugLabel: t('studio.slug_label'),
        statusLabel: t('studio.status_label'),
        studioActionDescription: t('studio.studio_action_description'),
        studioTitle: t('studio.title'),
        subtitleLabel: t('studio.subtitle_label'),
        summaryDescription: t('studio.summary_description'),
        summaryLabel: t('studio.summary_label'),
        bodyLabel: t('studio.body_label'),
        titleLabel: t('studio.title_label'),
        tagsLabel: t('studio.tags_label'),
        teaserLabel: t('studio.teaser_label'),
        typeLabel: t('studio.type_label'),
        unpublish: t('studio.unpublish'),
        uploadAction: t('studio.upload_action'),
        uploadCompleteToast: t('studio.upload_complete_toast'),
        widthLabel: t('studio.width_label'),
        yearLabel: t('studio.year_label'),
      }}
      workspaceId={wsId}
    />
  );
}
