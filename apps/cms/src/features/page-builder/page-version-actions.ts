'use server';

import {
  type CmsPageVersionPayload,
  toCmsPageVersionPayload,
} from '@tuturuuu/cms-blocks/schema';
import {
  publishWorkspaceExternalProjectPageVersion,
  saveWorkspaceExternalProjectPageVersion,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';
import {
  ENABLE_CMS_PAGE_BUILDER_CONFIG_ID,
  isPageBuilderEnabled,
} from './page-builder-flag';

async function requireAccess(wsId: string, publish: boolean) {
  const access = await getCmsWorkspaceAccess(wsId);
  if (!access.canAccessWorkspace || (publish && !access.canPublishPages))
    throw new Error('Forbidden');
  if (
    !isPageBuilderEnabled(
      await getWorkspaceConfig(
        access.normalizedWorkspaceId,
        ENABLE_CMS_PAGE_BUILDER_CONFIG_ID
      )
    )
  )
    throw new Error('Page builder unavailable');
  return {
    workspaceId: access.normalizedWorkspaceId,
    options: withForwardedInternalApiAuth(await headers()),
  };
}

async function writeDraft(
  context: Awaited<ReturnType<typeof requireAccess>>,
  entryId: string,
  input: CmsPageVersionPayload
) {
  const payload = toCmsPageVersionPayload(input.data);
  return z
    .object({ id: z.uuid() })
    .parse(
      await saveWorkspaceExternalProjectPageVersion(
        context.workspaceId,
        entryId,
        { data: payload.data, schemaVersion: payload.schema_version },
        context.options
      )
    );
}

export async function saveCmsPageDraft(
  wsId: string,
  entryId: string,
  input: CmsPageVersionPayload
): Promise<void> {
  await writeDraft(await requireAccess(wsId, false), entryId, input);
}

export async function publishCmsPage(
  wsId: string,
  entryId: string,
  input: CmsPageVersionPayload
): Promise<void> {
  const context = await requireAccess(wsId, true);
  const version = await writeDraft(context, entryId, input);
  await publishWorkspaceExternalProjectPageVersion(
    context.workspaceId,
    entryId,
    version.id,
    context.options
  );
}
