import {
  createEmptyCmsPage,
  parseCmsPageVersion,
} from '@tuturuuu/cms-blocks/schema';
import {
  getWorkspaceExternalProjectPageVersion,
  getWorkspaceExternalProjectStudio,
  listWorkspaceExternalProjectPageVersions,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { PageBuilderClient } from '@/features/page-builder/page-builder-client';
import {
  ENABLE_CMS_PAGE_BUILDER_CONFIG_ID,
  isPageBuilderEnabled,
} from '@/features/page-builder/page-builder-flag';
import {
  publishCmsPage,
  saveCmsPageDraft,
} from '@/features/page-builder/page-version-actions';
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

  const options = withForwardedInternalApiAuth(await headers());
  const versions = z
    .array(z.object({ id: z.uuid() }))
    .parse(
      await listWorkspaceExternalProjectPageVersions(
        workspaceId,
        entryId,
        options
      )
    );
  const latest = versions[0];
  let page = createEmptyCmsPage(entry.title);
  if (latest) {
    const row = z
      .object({ data: z.unknown(), schema_version: z.number() })
      .parse(
        await getWorkspaceExternalProjectPageVersion(
          workspaceId,
          entryId,
          latest.id,
          options
        )
      );
    const stored = parseCmsPageVersion(row);
    if (!stored) throw new Error('Unsupported saved page');
    page = stored;
  }
  return (
    <PageBuilderClient
      canPublishPages={access.canPublishPages}
      entryTitle={entry.title}
      initialPage={page}
      onSaveDraft={saveCmsPageDraft.bind(null, workspaceId, entryId)}
      onPublish={
        access.canPublishPages
          ? publishCmsPage.bind(null, workspaceId, entryId)
          : undefined
      }
    />
  );
}
