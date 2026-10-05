import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  resolveWorkspaceIdForPrincipal,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NotesVoiceError } from './schema';
export async function notesVoiceWorkspace(
  supabase: TypedSupabaseClient,
  user: { id: string; email?: string | null },
  wsId: string
) {
  const workspaceId = await resolveWorkspaceIdForPrincipal({
    authorizationClient: supabase,
    principal: { id: user.id, email: user.email ?? null },
    wsId,
  });
  if (!workspaceId) throw new NotesVoiceError(404, 'workspace_not_found');
  const membership = await verifyWorkspaceMembershipType({
    supabase,
    wsId: workspaceId,
    userId: user.id,
  });
  if (membership.error === 'membership_lookup_failed')
    throw new NotesVoiceError(503, 'membership_unavailable');
  if (!membership.ok) throw new NotesVoiceError(403, 'workspace_denied');
  return workspaceId;
}
