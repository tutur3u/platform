import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getHostMeetingTier } from '@tuturuuu/utils/meet-duration';
import { meetShortLinksEnabled } from '@tuturuuu/utils/meet-short-link-policy';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { MeetShortLinkError, type MeetShortLinkContext } from './service';
import { createSupabaseMeetShortLinkRepository } from './supabase-repository';

type Resolution =
  | { ok: true; ctx: MeetShortLinkContext }
  | { ok: false; response: NextResponse };

function denied(error: string, status: number): Resolution {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

async function isWorkspaceAdmin(
  admin: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data, error } = await admin.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'admin',
  });
  if (error) throw new MeetShortLinkError('unavailable');
  return data === true;
}

/**
 * Resolve a workspace member's short-link context for one meeting. Staff
 * status comes from the subject-bound Auth record and eligibility from the
 * stored meeting host's plan, never from caller-supplied claims.
 */
export async function resolveMeetShortLinkContext(
  request: NextRequest,
  params: Promise<{ wsId: string; meetingId: string }>
): Promise<Resolution> {
  const { wsId: rawWsId, meetingId } = await params;
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'meet' },
  });
  if (!auth.ok) return { ok: false, response: auth.response };
  const { supabase, user } = auth;

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });
  if (member.error === 'membership_lookup_failed')
    return denied('Failed to verify workspace access', 500);
  if (!member.ok) return denied('Workspace access denied', 403);

  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data: meeting, error } = await admin
    .from('workspace_meetings')
    .select('id, creator_id, time')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) return denied('unavailable', 503);
  if (!meeting) return denied('not_found', 404);

  try {
    const staff = isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(admin, user.id)
    );
    // Off until ttr.gg resolves /meet/{code}; then staff or a paid host.
    const eligible =
      meetShortLinksEnabled() &&
      (staff || (await getHostMeetingTier(meeting.creator_id)) !== 'FREE');
    const manager =
      meeting.creator_id === user.id ||
      (await isWorkspaceAdmin(admin, wsId, user.id));
    return {
      ok: true,
      ctx: {
        repo: createSupabaseMeetShortLinkRepository(admin),
        wsId,
        meetingId: meeting.id,
        meetingTime: meeting.time,
        actorId: user.id,
        staff,
        eligible,
        manager,
      },
    };
  } catch {
    return denied('unavailable', 503);
  }
}

export function meetShortLinkErrorResponse(error: unknown) {
  if (error instanceof MeetShortLinkError)
    return NextResponse.json(
      { error: error.code, code: error.code },
      { status: error.status }
    );
  console.error('Meeting short link request failed', error);
  return NextResponse.json({ error: 'unavailable' }, { status: 503 });
}
