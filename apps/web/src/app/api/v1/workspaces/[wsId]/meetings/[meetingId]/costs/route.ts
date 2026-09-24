import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  getMeetRealtimeUrl,
  signMeetJoinToken,
} from '@/lib/meet/realtime-token';

type Params = {
  params: Promise<{ meetingId: string; wsId: string }>;
};

/** Host-only cost estimate from the same room service used by Meet web. */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const headers = { 'Cache-Control': 'private, no-store' };
  const { meetingId, wsId: rawWsId } = await params;
  try {
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) return auth.response;
    const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
    const membership = await verifyWorkspaceMembershipType({
      supabase: auth.supabase,
      userId: auth.user.id,
      wsId,
    });
    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: membership.error ? 500 : 403, headers }
      );
    }
    const { data: meeting, error } = await auth.supabase
      .from('workspace_meetings')
      .select('creator_id,id,ws_id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load meeting costs', {
        meetingId,
        wsId,
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Meeting lookup failed' },
        { status: 500, headers }
      );
    }
    if (!meeting) {
      return NextResponse.json(
        { error: 'Meeting not found' },
        { status: 404, headers }
      );
    }
    if (meeting.creator_id !== auth.user.id) {
      return NextResponse.json(
        { error: 'Only the host can view costs' },
        { status: 403, headers }
      );
    }
    const signed = signMeetJoinToken({
      meetingId,
      mode: 'call',
      role: 'host',
      service: true,
      userId: auth.user.id,
      wsId,
    });
    const endpoint = new URL(getMeetRealtimeUrl());
    endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
    endpoint.pathname = '/room-service';
    endpoint.search = '';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signed.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'costs' }),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Room costs unavailable' },
        { status: 503, headers }
      );
    }
    return NextResponse.json(await response.json(), { headers });
  } catch (error) {
    console.error('Failed to read meeting costs', {
      meetingId,
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Room costs unavailable' },
      { status: 503, headers }
    );
  }
}
