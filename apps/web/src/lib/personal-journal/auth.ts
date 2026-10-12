import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { JournalScope } from './service';

export const journalHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};
export function journalResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: journalHeaders });
}
export async function resolveJournalWorkspaceId(
  routeWorkspaceId: string,
  supabase: TypedSupabaseClient,
  request?: NextRequest
) {
  // Only the documented personal alias and UUIDs avoid privileged handle fallback.
  if (
    routeWorkspaceId.toLowerCase() !== 'personal' &&
    !z.guid().safeParse(routeWorkspaceId).success
  )
    return null;
  return normalizeWorkspaceId(routeWorkspaceId, supabase, request);
}
export async function authorizeJournal(
  request: NextRequest,
  routeWorkspaceId: string
): Promise<
  { ok: true; scope: JournalScope } | { ok: false; response: Response }
> {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
  if (authError || !user)
    return {
      ok: false,
      response: journalResponse({ error: 'Unauthorized' }, 401),
    };
  const workspaceId = await resolveJournalWorkspaceId(
    routeWorkspaceId,
    supabase,
    request
  );
  if (!workspaceId)
    return {
      ok: false,
      response: journalResponse({ error: 'Forbidden' }, 403),
    };
  const membership = await verifyWorkspaceMembershipType({
    supabase,
    wsId: workspaceId,
    userId: user.id,
    requiredType: 'MEMBER',
  });
  if (membership.error === 'membership_lookup_failed')
    return {
      ok: false,
      response: journalResponse({ error: 'Access unavailable' }, 500),
    };
  if (!membership.ok)
    return {
      ok: false,
      response: journalResponse({ error: 'Forbidden' }, 403),
    };
  const { data, error } = await supabase
    .from('workspaces')
    .select('id,personal,creator_id,deleted')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error)
    return {
      ok: false,
      response: journalResponse({ error: 'Access unavailable' }, 500),
    };
  if (!data?.personal || data.deleted || data.creator_id !== user.id)
    return {
      ok: false,
      response: journalResponse({ error: 'Forbidden' }, 403),
    };
  return { ok: true, scope: { actorId: user.id, workspaceId } };
}
