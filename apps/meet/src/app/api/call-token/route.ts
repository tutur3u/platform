import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { z } from 'zod';
import { getMeetCallSession } from '@/features/call/lib/call-session';

const requestSchema = z.object({
  meetingId: z.string().uuid(),
  wsId: z.string().min(1),
});

/**
 * Re-mints a join token for an in-progress call.
 *
 * Join tokens are deliberately short-lived, but calls are not. Without this a
 * client that loses its socket after the token expires could never reconnect,
 * and would sit on "Reconnecting…" for the rest of the meeting. Membership is
 * re-checked on every refresh, so a participant removed from the workspace
 * mid-call stops being able to rejoin.
 */
export async function POST(request: Request) {
  await connection();

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const user = await getSatelliteAppSessionUser('meet');
  if (!user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await getWorkspace(parsed.data.wsId, {
    useAdmin: true,
    user,
  });
  if (!workspace?.joined) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createAdminClient({ noCookie: true });
  const { data: meeting } = await supabase
    .from('workspace_meetings')
    .select('id, creator_id')
    .eq('id', parsed.data.meetingId)
    .eq('ws_id', workspace.id)
    .maybeSingle();

  if (!meeting) {
    return Response.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const profile = user as {
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
  };
  const session = await getMeetCallSession({
    displayName:
      profile.display_name || profile.full_name || profile.email || 'Guest',
    isHost: meeting.creator_id === user.id,
    meetingId: meeting.id,
    userId: user.id,
    wsId: workspace.id,
  });

  return Response.json(
    { realtimeUrl: session.realtimeUrl, token: session.token },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
