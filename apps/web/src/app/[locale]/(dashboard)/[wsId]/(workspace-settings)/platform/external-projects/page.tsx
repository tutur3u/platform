import { createClient } from '@tuturuuu/supabase/next/server';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { hasRootExternalProjectsAdminPermission } from '@/lib/external-projects/access';
import {
  listCanonicalExternalProjects,
  listWorkspaceExternalProjectBindingAudits,
} from '@/lib/external-projects/store';
import { RootExternalProjectsAdminClient } from './root-admin-client';

export const metadata: Metadata = {
  title: 'External Projects',
  description:
    'Manage canonical external project definitions and workspace bindings.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function PlatformExternalProjectsPage({ params }: Props) {
  const { wsId: rawWsId } = await params;
  const supabase = await createClient();
  const wsId =
    rawWsId === ROOT_WORKSPACE_ID ? rawWsId : resolveWorkspaceId(rawWsId);
  const normalizedWsId =
    wsId === ROOT_WORKSPACE_ID
      ? ROOT_WORKSPACE_ID
      : await normalizeWorkspaceId(rawWsId, supabase);

  if (normalizedWsId !== ROOT_WORKSPACE_ID) {
    redirect(`/${rawWsId}/settings`);
  }

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions) notFound();
  if (!hasRootExternalProjectsAdminPermission(permissions)) {
    redirect(`/${rawWsId}/settings`);
  }

  const t = await getTranslations('external-projects');
  const [projects, audits] = await Promise.all([
    listCanonicalExternalProjects(),
    listWorkspaceExternalProjectBindingAudits(),
  ]);

  return (
    <RootExternalProjectsAdminClient
      initialAudits={audits}
      initialProjects={projects}
      strings={{
        activeLabel: t('root.active_label'),
        activeProjectsLabel: t('root.active_projects_label'),
        adapterCoverageLabel: t('root.adapter_coverage_label'),
        adapterLabel: t('root.adapter_label'),
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
        registryTitle: t('root.registry_title'),
        saveAction: t('root.save_action'),
        totalProjectsLabel: t('root.total_projects_label'),
        unbindAction: t('root.unbind_action'),
        unboundLabel: t('root.unbound_label'),
        useForBindingAction: t('root.use_for_binding_action'),
        workspaceIdLabel: t('root.workspace_id_label'),
      }}
    />
  );
}
