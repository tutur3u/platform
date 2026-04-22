import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { CollectionDetailClient } from '@/features/cms-studio/collections/[collectionId]/collection-detail-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    collectionId: string;
    wsId: string;
  }>;
}

export default async function CmsLibraryCollectionPage({ params }: Props) {
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
      strings={buildCmsStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
