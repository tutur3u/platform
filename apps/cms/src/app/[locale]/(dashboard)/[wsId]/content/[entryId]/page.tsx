import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EntryDetailClient } from '@/features/epm/entries/[entryId]/entry-detail-client';
import { buildEpmStrings } from '@/features/epm/epm-strings';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    entryId: string;
    wsId: string;
  }>;
}

export default async function CmsEntryDetailPage({ params }: Props) {
  const { entryId, wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const t = await getTranslations('external-projects');

  return (
    <EntryDetailClient
      binding={access.binding}
      entryId={entryId}
      strings={buildEpmStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
