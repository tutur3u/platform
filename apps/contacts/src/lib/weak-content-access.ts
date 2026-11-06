import {
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/** Class management is the existing permission closest to homeroom duties. */
const WEAK_CONTENT_EDITOR_PERMISSION = 'update_user_groups';

/**
 * Weak-support tutoring content is the text of a `require_attention`
 * feedback. When the workspace tutoring policy restricts it, creating, editing
 * or deleting it also needs class-management permission. Returns a 403 to
 * send, or null when the write may continue. Mirrors the web API gate.
 */
export async function denyRestrictedWeakContent({
  permissions,
  sbAdmin,
  touchesWeakContent,
  wsId,
}: {
  permissions: {
    containsPermission: (
      permission: typeof WEAK_CONTENT_EDITOR_PERMISSION
    ) => boolean;
  };
  sbAdmin: TypedSupabaseClient;
  touchesWeakContent: boolean;
  wsId: string;
}) {
  if (!touchesWeakContent) return null;
  if (permissions.containsPermission(WEAK_CONTENT_EDITOR_PERMISSION))
    return null;

  const { data, error } = await sbAdmin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', wsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);
  if (error) {
    console.error('Failed to read tutoring policy for content access', {
      error,
      wsId,
    });
    return Response.json(
      { message: 'Failed to verify tutoring content access' },
      { status: 500 }
    );
  }

  if (!readTutoringPolicyConfigRows(data ?? []).restrictWeakContentEditors)
    return null;
  return Response.json(
    {
      code: 'TUTORING_CONTENT_RESTRICTED',
      message: 'Only class managers can change weak-support tutoring content',
    },
    { status: 403 }
  );
}
