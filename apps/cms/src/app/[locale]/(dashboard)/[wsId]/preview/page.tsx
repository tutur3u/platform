import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EpmClient } from '@/features/epm/epm-client';
import { buildEpmStrings } from '@/features/epm/epm-strings';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsPreviewPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const t = await getTranslations('external-projects');

  return (
    <EpmClient
      binding={access.binding}
      initialMode="preview"
      strings={buildEpmStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
