import {
  listCanonicalExternalProjects,
  listWorkspaceExternalProjectBindingAudits,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RootExternalProjectsAdminClient } from '@/features/admin/root-admin-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsAdminPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessAdmin) {
    redirect('/no-access');
  }

  const requestHeaders = await headers();
  const internalApiOptions = withForwardedInternalApiAuth(requestHeaders);
  const [projects, audits, t] = await Promise.all([
    listCanonicalExternalProjects(internalApiOptions),
    listWorkspaceExternalProjectBindingAudits(internalApiOptions),
    getTranslations('external-projects'),
  ]);

  return (
    <RootExternalProjectsAdminClient
      initialAudits={audits}
      initialProjects={projects}
      strings={{
        actionPanelDescription: t('root.action_panel_description'),
        actionPanelTitle: t('root.action_panel_title'),
        activeLabel: t('root.active_label'),
        activeProjectsLabel: t('root.active_projects_label'),
        adapterCoverageLabel: t('root.adapter_coverage_label'),
        adapterLabel: t('root.adapter_label'),
        allAdaptersLabel: t('root.all_adapters_label'),
        auditFeedDescription: t('root.audit_feed_description'),
        bindAction: t('root.bind_action'),
        bindDescription: t('root.bind_description'),
        bindTitle: t('root.bind_title'),
        bindingPreviewLabel: t('root.binding_preview_label'),
        canonicalIdLabel: t('root.canonical_id_label'),
        createAction: t('root.create_action'),
        createDescription: t('root.create_description'),
        createTitle: t('root.create_title'),
        deliveryProfileHint: t('root.delivery_profile_hint'),
        deliveryProfileLabel: t('root.delivery_profile_label'),
        displayNameLabel: t('root.display_name_label'),
        inactiveLabel: t('root.inactive_label'),
        invalidJsonLabel: t('root.invalid_json_label'),
        liveBindingsLabel: t('root.live_bindings_label'),
        noAuditsDescription: t('root.no_audits_description'),
        noAuditsTitle: t('root.no_audits_title'),
        noProjectsDescription: t('root.no_projects_description'),
        noProjectsTitle: t('root.no_projects_title'),
        overviewDescription: t('root.overview_description'),
        overviewTitle: t('root.overview_title'),
        recentAuditsTitle: t('root.recent_audits_title'),
        recommendedCollectionsLabel: t('root.recommended_collections_label'),
        registryDescription: t('root.registry_description'),
        registryTitle: t('root.registry_title'),
        resultsLabel: t('root.results_label'),
        rootSearchPlaceholder: t('root.root_search_placeholder'),
        saveAction: t('root.save_action'),
        searchEmptyDescription: t('root.search_empty_description'),
        searchEmptyTitle: t('root.search_empty_title'),
        totalProjectsLabel: t('root.total_projects_label'),
        unbindAction: t('root.unbind_action'),
        unboundLabel: t('root.unbound_label'),
        useForBindingAction: t('root.use_for_binding_action'),
        workspaceIdLabel: t('root.workspace_id_label'),
      }}
    />
  );
}
