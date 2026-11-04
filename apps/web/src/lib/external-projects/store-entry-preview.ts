import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * Private preview of one entry. Read-only: it changes no status, records no
 * publish event and leaves the public delivery cache alone.
 */
export async function previewWorkspaceExternalProjectEntry(
  { entryId, workspaceId }: { entryId: string; workspaceId: string },
  db: TypedSupabaseClient
) {
  const { data, error } = await db
    .from('workspace_external_project_entries')
    .select('*')
    .eq('id', entryId)
    .eq('ws_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
