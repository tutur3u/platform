import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * Whether [actorUserId] may delete other members' messages in [wsId]'s
 * conversations. This is the check `private.chat_delete_message` enforces
 * (`public.has_workspace_permission(ws, actor, 'moderate_chat')`); clients
 * use it only to offer the action, and the delete stays enforced in SQL.
 * A failed check reports `false`, so the action is hidden rather than
 * shown and refused.
 */
export async function canModerateChat({
  actorUserId,
  wsId,
}: {
  actorUserId: string;
  wsId: string;
}) {
  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data, error } = await sbAdmin.rpc('has_workspace_permission', {
      p_permission: 'moderate_chat',
      p_user_id: actorUserId,
      p_ws_id: wsId,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn('Failed to resolve chat moderation permission', {
      error: error instanceof Error ? error.message : String(error),
      wsId,
    });
    return false;
  }
}
