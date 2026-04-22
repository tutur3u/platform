import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { CmsStudioClient } from '@/features/cms-studio/cms-studio-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsLibraryPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const t = await getTranslations('external-projects');

  return (
    <CmsStudioClient
      availableEditSections={['entries', 'workflow']}
      binding={access.binding}
      headerDescription="Manage collections, entries, and editorial workflow from the CMS library."
      initialEditSection="entries"
      initialMode="edit"
      showModeSwitch={false}
      strings={buildCmsStrings(t)}
      workspaceId={access.normalizedWorkspaceId}
    />
  );
}
