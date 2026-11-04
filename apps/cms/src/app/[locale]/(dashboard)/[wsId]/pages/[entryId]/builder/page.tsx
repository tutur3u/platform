import { createEmptyCmsPage } from '@tuturuuu/cms-blocks/schema';
import {
  getWorkspaceExternalProjectStudio,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PageBuilderClient } from '@/features/page-builder/page-builder-client';
import {
  ENABLE_CMS_PAGE_BUILDER_CONFIG_ID,
  isPageBuilderEnabled,
} from '@/features/page-builder/page-builder-flag';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{ entryId: string; wsId: string }>;
}

export default async function CmsPageBuilderPage({ params }: Props) {
  const { entryId, wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessWorkspace) redirect('/no-access');

  const workspaceId = access.normalizedWorkspaceId;
  const enabled = isPageBuilderEnabled(
    await getWorkspaceConfig(workspaceId, ENABLE_CMS_PAGE_BUILDER_CONFIG_ID)
  );
  if (!enabled) notFound();

  const studio = await getWorkspaceExternalProjectStudio(
    workspaceId,
    withForwardedInternalApiAuth(await headers())
  );
  const entry = studio.entries.find((item) => item.id === entryId);
  if (!entry) notFound();

  // The route/action layer (CMS-D) passes onSaveDraft/onPublish wired to the page-versions API.
  return (
    <PageBuilderClient
      canPublishPages={access.canPublishPages}
      entryTitle={entry.title}
      initialPage={createEmptyCmsPage(entry.title)}
    />
  );
}
