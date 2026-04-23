import { redirect } from 'next/navigation';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    entryId: string;
    wsId: string;
  }>;
}

export default async function CmsLibraryEntryPage({ params }: Props) {
  const { entryId, wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }
  redirect(`/${wsId}/library?entryId=${entryId}`);
}
