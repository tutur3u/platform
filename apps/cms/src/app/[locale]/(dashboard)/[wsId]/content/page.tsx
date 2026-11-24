import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { CmsStudioClient } from '@/features/cms-studio/cms-studio-client';
import { EditModeSkeleton } from '@/features/cms-studio/cms-studio-skeletons';
import { getCmsGamesEnabled } from '@/lib/cms-games';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';
import { loadInitialCmsStudio } from '@/lib/external-projects/initial-studio';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type StudioProps = Parameters<typeof CmsStudioClient>[0];

async function PrefetchedCmsStudio(props: StudioProps) {
  const initialStudio = await loadInitialCmsStudio(props.workspaceId);

  return <CmsStudioClient {...props} initialStudio={initialStudio} />;
}

export default async function CmsLibraryPage({ params, searchParams }: Props) {
  const { wsId } = await params;
  const resolvedSearchParams = await searchParams;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const [cmsGamesEnabled, t] = await Promise.all([
    getCmsGamesEnabled(access.normalizedWorkspaceId),
    getTranslations('external-projects'),
  ]);

  return (
    <Suspense fallback={<EditModeSkeleton />}>
      <PrefetchedCmsStudio
        availableEditSections={['entries', 'workflow']}
        binding={access.binding}
        cmsGamesEnabled={cmsGamesEnabled}
        collectionScope="library"
        headerDescription={t('epm.library_page_description')}
        headerTitle={t('epm.nav_content')}
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
    </Suspense>
  );
}
