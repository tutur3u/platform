import {
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';

/** Class management is the existing permission closest to homeroom duties. */
export const WEAK_CONTENT_EDITOR_PERMISSION = 'update_user_groups';

interface PermissionChecker {
  withoutPermission: (
    permission: typeof WEAK_CONTENT_EDITOR_PERMISSION
  ) => boolean;
}

/**
 * Weak-support tutoring content is the text of a `require_attention`
 * feedback. When the workspace tutoring policy restricts it, setting, editing,
 * deleting or ending it also needs class-management permission. Returns a 403
 * response to send, or null when the write may continue.
 */
export async function denyWeakContentEdit({
  permissions,
  sbAdmin,
  touchesWeakContent,
  wsId,
}: {
  permissions: PermissionChecker;
  sbAdmin: TypedSupabaseClient;
  touchesWeakContent: boolean;
  wsId: string;
}) {
  if (!touchesWeakContent) return null;
  if (!permissions.withoutPermission(WEAK_CONTENT_EDITOR_PERMISSION))
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
    return NextResponse.json(
      { message: 'Failed to verify tutoring content access' },
      { status: 500 }
    );
  }

  const policy = readTutoringPolicyConfigRows(data ?? []);
  if (!policy.restrictWeakContentEditors) return null;
  return NextResponse.json(
    {
      code: 'TUTORING_CONTENT_RESTRICTED',
      message: 'Only class managers can change weak-support tutoring content',
    },
    { status: 403 }
  );
}
