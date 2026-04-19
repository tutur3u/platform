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
import { buildEpmStrings } from '../../epm-strings';
import { EntryDetailClient } from './entry-detail-client';

export const metadata: Metadata = {
  title: 'EPM Entry',
  description:
    'Detailed entry management for workspace-bound external project content.',
};

interface Props {
  params: Promise<{
    entryId: string;
    wsId: string;
  }>;
}

export default async function EpmEntryDetailPage({ params }: Props) {
  const { entryId, wsId: rawWsId } = await params;
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
  const entry = studio.entries.find((item) => item.id === entryId);

  if (!entry) {
    notFound();
  }

  return (
    <EntryDetailClient
      binding={binding}
      entryId={entryId}
      initialStudio={studio}
      strings={buildEpmStrings(t)}
      workspaceId={wsId}
    />
  );
}
