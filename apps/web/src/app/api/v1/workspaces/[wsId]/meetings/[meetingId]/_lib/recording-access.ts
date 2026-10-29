import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function canManageLegacyRecording({
  supabase,
  wsId,
  userId,
  creatorId,
}: {
  supabase: TypedSupabaseClient;
  wsId: string;
  userId: string;
  creatorId: string | null;
}): Promise<boolean> {
  if (creatorId === userId) return true;
  const { data, error } = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'admin',
  });
  if (error) throw new Error('Failed to verify recording permissions');
  return data === true;
}
