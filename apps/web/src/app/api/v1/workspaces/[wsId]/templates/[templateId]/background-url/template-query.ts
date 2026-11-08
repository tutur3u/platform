import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceId } from '@tuturuuu/utils/workspace-id';

export function getBackgroundTemplate(
  supabase: TypedSupabaseClient,
  wsId: WorkspaceId,
  templateId: string
) {
  return supabase
    .from('board_templates')
    .select('background_path,created_by,visibility')
    .eq('id', templateId)
    .eq('ws_id', wsId)
    .maybeSingle();
}
