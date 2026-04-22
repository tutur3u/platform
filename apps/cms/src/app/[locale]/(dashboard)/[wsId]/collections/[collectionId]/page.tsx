import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CollectionDetailClient } from '@/features/epm/collections/[collectionId]/collection-detail-client';
import { buildEpmStrings } from '@/features/epm/epm-strings';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    collectionId: string;
    wsId: string;
  }>;
}

export default async function CmsCollectionDetailPage({ params }: Props) {
  const { collectionId, wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const t = await getTranslations('external-projects');

  return (
    <CollectionDetailClient
      binding={access.binding}
      collectionId={collectionId}
      strings={buildEpmStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
