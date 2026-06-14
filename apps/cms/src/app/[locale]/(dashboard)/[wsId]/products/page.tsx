import { redirect } from 'next/navigation';
import { CmsProductsClient } from '@/features/cms-studio/products/cms-products-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsProductsPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  return <CmsProductsClient workspaceId={access.normalizedWorkspaceId} />;
}
