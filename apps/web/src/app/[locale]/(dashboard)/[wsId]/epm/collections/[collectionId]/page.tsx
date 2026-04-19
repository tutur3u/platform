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
import { CollectionDetailClient } from './collection-detail-client';

export const metadata: Metadata = {
  title: 'EPM Collection',
  description:
    'Collection management for workspace-bound external project content.',
};

interface Props {
  params: Promise<{
    collectionId: string;
    wsId: string;
  }>;
}

export default async function EpmCollectionDetailPage({ params }: Props) {
  const { collectionId, wsId: rawWsId } = await params;
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
  const collection = studio.collections.find(
    (item) => item.id === collectionId
  );

  if (!collection) {
    notFound();
  }

  return (
    <CollectionDetailClient
      binding={binding}
      collectionId={collectionId}
      initialStudio={studio}
      strings={buildEpmStrings(t)}
      workspaceId={wsId}
    />
  );
}
