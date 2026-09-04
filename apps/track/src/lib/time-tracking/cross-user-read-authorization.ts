import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type ResolveTimeTrackingReadUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function resolveTimeTrackingReadUser({
  supabase,
  targetUserId,
  user,
  wsId,
}: {
  supabase: TypedSupabaseClient;
  targetUserId: string | null;
  user: SupabaseUser;
  wsId: string;
}): Promise<ResolveTimeTrackingReadUserResult> {
  const actorId = user.id;
  if (!targetUserId || targetUserId === actorId) {
    return { ok: true, userId: actorId };
  }

  const permissions = await getPermissions({ user, wsId });

  if (!permissions) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to resolve permissions' },
        { status: 500 }
      ),
    };
  }

  if (permissions.withoutPermission('manage_time_tracking_requests')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Insufficient permissions to view other users data' },
        { status: 403 }
      ),
    };
  }

  const targetMembership = await verifyWorkspaceMembershipType({
    wsId,
    userId: targetUserId,
    supabase,
  });

  if (targetMembership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to verify target user access' },
        { status: 500 }
      ),
    };
  }

  if (!targetMembership.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Target user not found in workspace' },
        { status: 404 }
      ),
    };
  }

  return { ok: true, userId: targetUserId };
}
