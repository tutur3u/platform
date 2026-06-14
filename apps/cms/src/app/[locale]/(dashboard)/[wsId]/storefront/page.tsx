import { redirect } from 'next/navigation';
import { CmsStorefrontClient } from '@/features/cms-studio/storefront/cms-storefront-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsStorefrontPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  return <CmsStorefrontClient workspaceId={access.normalizedWorkspaceId} />;
}
