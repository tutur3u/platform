import { redirect } from 'next/navigation';
import { CmsMediaLibraryClient } from '@/features/cms-studio/media/cms-media-library-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsMediaPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  return <CmsMediaLibraryClient workspaceId={access.normalizedWorkspaceId} />;
}
