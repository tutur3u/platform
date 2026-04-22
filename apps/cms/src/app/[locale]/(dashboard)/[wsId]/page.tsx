import { redirect } from 'next/navigation';
import { CmsHomeClient } from '@/features/home/cms-home-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsWorkspaceHomePage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.canAccessAdmin && !access.canAccessWorkspace) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  return (
    <CmsHomeClient
      workspaceId={access.normalizedWorkspaceId}
      workspaceSlug={wsId}
    />
  );
}
