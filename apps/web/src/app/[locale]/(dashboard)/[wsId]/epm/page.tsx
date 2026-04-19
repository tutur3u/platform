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
import { EpmClient } from './epm-client';

export const metadata: Metadata = {
  title: 'EPM',
  description:
    'External Project Management for workspace-bound canonical content, workflow, and delivery.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function EpmPage({ params }: Props) {
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

  const [t, studio] = await Promise.all([
    getTranslations('external-projects'),
    getWorkspaceExternalProjectStudioData(wsId),
  ]);

  return (
    <EpmClient
      binding={binding}
      initialStudio={studio}
      strings={{
        activityTab: t('epm.activity_tab'),
        activityFeedTitle: t('epm.activity_feed_title'),
        archivedQueue: t('epm.archived_queue'),
        archiveAction: t('epm.archive_action'),
        archiveBacklogHint: t('epm.archive_backlog_hint'),
        assetsLabel: t('epm.assets_label'),
        attentionTitle: t('epm.attention_title'),
        bulkActionsTitle: t('epm.bulk_actions_title'),
        bulkSelectionHint: t('epm.bulk_selection_hint'),
        cancelAction: t('epm.cancel_action'),
        collectionFallbackLabel: t('epm.collection_fallback_label'),
        collectionHealthTitle: t('epm.collection_health_title'),
        collectionsLabel: t('epm.collections_label'),
        collectionsMetricLabel: t('epm.collections_metric_label'),
        contentTab: t('epm.content_tab'),
        createEntryAction: t('epm.create_entry_action'),
        dashboardModeLabel: t('epm.dashboard_mode_label'),
        dashboardPreferencesTitle: t('epm.dashboard_preferences_title'),
        densityCompact: t('epm.density_compact'),
        densityComfortable: t('epm.density_comfortable'),
        densityLabel: t('epm.density_label'),
        draftQueue: t('epm.draft_queue'),
        entryDeckTitle: t('epm.entry_deck_title'),
        duplicateAction: t('epm.duplicate_action'),
        editCollectionAction: t('epm.edit_collection_action'),
        editCollectionDescription: t('epm.edit_collection_description'),
        editEntryAction: t('epm.edit_entry_action'),
        editEntryDescription: t('epm.edit_entry_description'),
        editEntryTitle: t('epm.edit_entry_title'),
        emptyCollection: t('epm.empty_collection'),
        emptyEntries: t('epm.empty_entries'),
        enabledLabel: t('epm.enabled_label'),
        entrySummaryTitle: t('epm.entry_summary_title'),
        entriesMetricLabel: t('epm.entries_metric_label'),
        featuredEntryTitle: t('epm.featured_entry_title'),
        filterAll: t('epm.filter_all'),
        focusOperator: t('epm.focus_operator'),
        focusVisual: t('epm.focus_visual'),
        focusWorkflow: t('epm.focus_workflow'),
        importAction: t('epm.import_action'),
        importHint: t('epm.import_hint'),
        loadingPreviewLabel: t('epm.loading_preview_label'),
        metadataLabel: t('epm.metadata_label'),
        missingLeadImageLabel: t('epm.missing_lead_image_label'),
        noAdapterLabel: t('epm.no_adapter_label'),
        noCanonicalIdLabel: t('epm.no_canonical_id_label'),
        noneLabel: t('epm.none_label'),
        notScheduledLabel: t('epm.not_scheduled_label'),
        openPreviewAction: t('epm.open_preview_action'),
        overviewTab: t('epm.overview_tab'),
        payloadLabel: t('epm.payload_label'),
        previewDescription: t('epm.preview_description'),
        previewTitle: t('epm.preview_title'),
        profileDataLabel: t('epm.profile_data_label'),
        publishedQueue: t('epm.published_queue'),
        publishAction: t('epm.publish_action'),
        quickCreateHint: t('epm.quick_create_hint'),
        recentUnpublishedHint: t('epm.recent_unpublished_hint'),
        recoveryHint: t('epm.recovery_hint'),
        refreshAction: t('epm.refresh_action'),
        renderedLabel: t('epm.rendered_label'),
        saveAction: t('epm.save_action'),
        scheduleAction: t('epm.schedule_action'),
        scheduledForLabel: t('epm.scheduled_for_label'),
        scheduledQueue: t('epm.scheduled_queue'),
        searchPlaceholder: t('epm.search_placeholder'),
        settingsTab: t('epm.settings_tab'),
        showActivityLabel: t('epm.show_activity_label'),
        showCollectionsLabel: t('epm.show_collections_label'),
        showVisualsLabel: t('epm.show_visuals_label'),
        slugLabel: t('epm.slug_label'),
        statusArchived: t('epm.status_archived'),
        statusDraft: t('epm.status_draft'),
        statusLabel: t('epm.status_label'),
        statusPublished: t('epm.status_published'),
        statusScheduled: t('epm.status_scheduled'),
        subtitleLabel: t('epm.subtitle_label'),
        summaryLabel: t('epm.summary_label'),
        tabsDescription: t('epm.tabs_description'),
        title: t('epm.title'),
        titleLabel: t('epm.title_label'),
        unboundLabel: t('epm.unbound_label'),
        unpublishAction: t('epm.unpublish_action'),
        unknownCollectionLabel: t('epm.unknown_collection_label'),
        visualBoardTitle: t('epm.visual_board_title'),
        workflowTab: t('epm.workflow_tab'),
        workspaceBindingLabel: t('epm.workspace_binding_label'),
        workspaceStatusTitle: t('epm.workspace_status_title'),
      }}
      workspaceId={wsId}
    />
  );
}
