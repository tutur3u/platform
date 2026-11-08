import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json, WorkspaceExternalProjectBinding } from '@tuturuuu/types';
import { invalidateWorkspaceExternalProjectCache } from './cache';
import { unpublishPageVersion } from './page-versions';
import { buildWorkspaceExternalProjectDeliveryPayload } from './store';

type AdminDb = TypedSupabaseClient;

export async function publishWorkspaceExternalProjectEntry(
  {
    actorId,
    binding,
    entryId,
    eventKind,
    visibilityScope,
    workspaceId,
  }: {
    actorId: string;
    binding: WorkspaceExternalProjectBinding;
    entryId: string;
    eventKind: 'publish' | 'preview' | 'unpublish';
    visibilityScope: string;
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  if (eventKind === 'unpublish') {
    const entry = await unpublishPageVersion(admin, {
      actorId,
      entryId,
      workspaceId,
    });
    await invalidateWorkspaceExternalProjectCache(workspaceId);
    return entry;
  }
  const nextStatus = 'published';
  const publishedAt = new Date().toISOString();

  const { data: entry, error: entryError } = await admin
    .from('workspace_external_project_entries')
    .update({
      published_at: publishedAt,
      status: nextStatus,
      updated_by: actorId,
    })
    .eq('id', entryId)
    .eq('ws_id', workspaceId)
    .select('*')
    .single();

  if (entryError) {
    throw new Error(entryError.message);
  }

  const payload = await buildWorkspaceExternalProjectDeliveryPayload(
    {
      binding,
      includeDrafts: eventKind === 'preview',
      workspaceId,
    },
    admin
  );

  const { error: eventError } = await admin
    .from('workspace_external_project_publish_events')
    .insert([
      {
        canonical_external_project_id: binding.canonical_id as string,
        entry_id: entry.id,
        event_kind: eventKind,
        payload: payload as NonNullable<Json>,
        profile_data: payload.profileData as NonNullable<Json>,
        triggered_by: actorId,
        visibility_scope: visibilityScope,
        ws_id: workspaceId,
      },
    ]);

  if (eventError) {
    throw new Error(eventError.message);
  }

  await invalidateWorkspaceExternalProjectCache(workspaceId);
  return entry;
}
