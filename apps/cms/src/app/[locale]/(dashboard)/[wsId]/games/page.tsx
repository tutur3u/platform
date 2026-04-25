import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { CmsStudioClient } from '@/features/cms-studio/cms-studio-client';
import { getCmsGamesEnabled } from '@/lib/cms-games';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CmsGamesPage({ params, searchParams }: Props) {
  const { wsId } = await params;
  const resolvedSearchParams = await searchParams;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  if (!(await getCmsGamesEnabled(access.normalizedWorkspaceId))) {
    redirect(`/${wsId}/library`);
  }

  const t = await getTranslations('external-projects');

  return (
    <CmsStudioClient
      availableEditSections={['entries', 'workflow']}
      binding={access.binding}
      cmsGamesEnabled
      collectionScope="games"
      headerDescription={t('epm.games_page_description')}
      initialEditSection="entries"
      initialEditorEntryId={
        typeof resolvedSearchParams.entryId === 'string'
          ? resolvedSearchParams.entryId
          : null
      }
      initialMode="edit"
      showModeSwitch={false}
      strings={buildCmsStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
