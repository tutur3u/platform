import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function assertWorkspaceExternalProjectReference(
  db: TypedSupabaseClient,
  kind: 'collections' | 'entries',
  id: string | null | undefined,
  workspaceId: string
) {
  if (!id) return;
  const { data, error } = await db
    .from(
      kind === 'collections'
        ? 'workspace_external_project_collections'
        : 'workspace_external_project_entries'
    )
    .select('id')
    .eq('id', id)
    .eq('ws_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Referenced resource not found');
}
