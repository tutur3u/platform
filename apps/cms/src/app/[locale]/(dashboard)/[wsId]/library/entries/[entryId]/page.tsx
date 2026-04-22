import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { EntryDetailClient } from '@/features/cms-studio/entries/[entryId]/entry-detail-client';
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

  const t = await getTranslations('external-projects');

  return (
    <EntryDetailClient
      binding={access.binding}
      entryId={entryId}
      strings={buildCmsStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
