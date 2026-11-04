import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getPublishedPageVersion, publishPageVersion } from './page-versions';
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
  const previous = await getPublishedPageVersion(admin, scope);
  let target: ReturnType<typeof rendererPurgeTarget> | null = null;
  if (previous) {
    const { data: entry, error } = await admin
      .from('workspace_external_project_entries')
      .select('slug')
      .eq('ws_id', scope.workspaceId)
      .eq('id', scope.entryId)
      .single();
    if (error || !entry) throw new Error('Failed to resolve page path');
    target = rendererPurgeTarget({
      ...scope,
      slug: entry.slug,
      version: previous.id,
    });
  }
  const published = await publishPageVersion(admin, scope);
  // Publication is already committed. Report a purge failure without claiming
  // the publish failed, which could cause an automatic duplicate publication.
  const cacheInvalidation = target
    ? await purgeRendererPage(target)
    : 'not-needed';
  if (cacheInvalidation === 'failed') {
    console.error('CMS renderer purge failed after publication', {
      workspaceId: scope.workspaceId,
      entryId: scope.entryId,
    });
  }
  return { ...published, cacheInvalidation };
}
