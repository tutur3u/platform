import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function resolveTimeTrackingWorkspaceAccess({
  rawWsId,
  sbAdmin,
  sessionClient,
  userId,
}: {
  rawWsId: string;
  sbAdmin: TypedSupabaseClient;
  sessionClient: TypedSupabaseClient;
  userId: string;
}): Promise<
  { normalizedWsId: string; ok: true } | { ok: false; response: NextResponse }
> {
  const normalizedWsId = await normalizeWorkspaceId(rawWsId, sessionClient);
  // Satellite session clients authenticate the actor through an app-session
  // token, but do not carry Supabase auth context for RLS. withSessionAuth has
  // already verified userId, so use the admin client for membership lookup.
  const membership = await verifyWorkspaceMembershipType({
    supabase: sbAdmin,
    userId,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { normalizedWsId, ok: true };
}
