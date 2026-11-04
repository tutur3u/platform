import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { invalidateWorkspaceExternalProjectCache } from './cache';
import { publishPageVersion } from './page-versions';
import { purgeRendererPage, rendererPurgeTarget } from './renderer-purge';

export async function publishPageAndPurge(
  admin: TypedSupabaseClient,
  scope: {
    actorId: string;
    entryId: string;
    versionId: string;
    workspaceId: string;
    siteId: string;
  }
) {
  const { data: entry, error } = await admin
    .from('workspace_external_project_entries')
    .select('slug')
    .eq('ws_id', scope.workspaceId)
    .eq('id', scope.entryId)
    .single();
  if (error || !entry) throw new Error('Failed to resolve page path');
  const target = rendererPurgeTarget({
    ...scope,
    slug: entry.slug,
    version: scope.versionId,
  });
  const { replaced_page_version_id: previousId, ...published } =
    await publishPageVersion(admin, scope);
  await invalidateWorkspaceExternalProjectCache(scope.workspaceId);
  // Publication is already committed. Report a purge failure without claiming
  // the publish failed, which could cause an automatic duplicate publication.
  const cacheInvalidation = previousId
    ? await purgeRendererPage({
        ...target,
        body: { ...target.body, version: previousId },
      })
    : 'not-needed';
  if (cacheInvalidation === 'failed') {
    console.error('CMS renderer purge failed after publication', {
      siteId: scope.siteId,
    });
  }
  return { ...published, cacheInvalidation };
}
