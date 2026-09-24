import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  getMeetRealtimeUrl,
  signMeetJoinToken,
} from '@/lib/meet/realtime-token';

type Params = {
  params: Promise<{ meetingId: string; wsId: string }>;
};

const headers = { 'Cache-Control': 'private, no-store' };

/** Read room state before opening local media, then return permitted post-call data. */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId, wsId: rawWsId } = await params;
  if (!z.uuid().safeParse(meetingId).success) {
    return NextResponse.json(
      { error: 'Invalid meeting' },
      { status: 400, headers }
    );
  }

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
        {
          status: membership.error === 'membership_lookup_failed' ? 500 : 403,
          headers,
        }
      );
    }

    const { data: meeting, error: meetingError } = await auth.supabase
      .from('workspace_meetings')
      .select('creator_id,id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: 'Meeting unavailable' },
        { status: meetingError ? 503 : 404, headers }
      );
    }

    const canManage = meeting.creator_id === auth.user.id;
    const signed = signMeetJoinToken({
      meetingId,
      mode: 'call',
      role: canManage ? 'host' : 'speaker',
      admission: 'lobby',
      userId: auth.user.id,
      wsId,
    });
    const endpoint = new URL(getMeetRealtimeUrl());
    endpoint.protocol =
      endpoint.protocol === 'wss:' || endpoint.protocol === 'https:'
        ? 'https:'
        : 'http:';
    endpoint.pathname = '/room-state';
    endpoint.search = '';
    const roomResponse = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${signed.token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!roomResponse.ok) throw new Error('room_state_unavailable');
    const room = (await roomResponse.json()) as {
      ended: boolean;
      canReadNotes: boolean;
    };
    if (!room.ended || !room.canReadNotes) {
      return NextResponse.json(
        { ended: room.ended, canReadNotes: room.canReadNotes, canManage },
        { headers }
      );
    }

    // Room policy has already authorized notes visibility. User-scoped RLS is
    // intentionally narrower, so read the permitted snapshot server-side.
    const admin = await createAdminClient({ noCookie: true });
    const { data: sessions, error: sessionsError } = await admin
      .from('meet_ai_sessions')
      .select(
        'id,created_at,notes,notes_status,notes_cost_usd,notes_unpriced_attempts,notes_usage'
      )
      .eq('meeting_id', meetingId)
      .order('created_at')
      .range(0, 999);
    if (sessionsError) throw new Error('meet_ai_sessions_unavailable');
    const sessionIds = sessions.map((session) => session.id);
    const chunks = [];
    if (sessionIds.length) {
      for (let offset = 0; offset <= 20_000; offset += 1000) {
        const page = await admin
          .from('meet_ai_chunks')
          .select(
            'id,session_id,sequence,start_seconds,transcript,status,cost_usd,prior_cost_usd,unpriced_attempts,usage'
          )
          .in('session_id', sessionIds)
          .order('created_at')
          .order('id')
          .range(offset, offset + 999);
        if (page.error) throw new Error('meet_ai_chunks_unavailable');
        if (offset === 20_000 && page.data.length > 0) {
          return NextResponse.json(
            { error: 'Transcript exceeds display limit' },
            { status: 413, headers }
          );
        }
        chunks.push(...page.data);
        if (page.data.length < 1000) break;
      }
    }
    const sessionOrder = new Map(
      sessions.map((session, index) => [session.id, index])
    );
    chunks.sort(
      (a, b) =>
        (sessionOrder.get(a.session_id) ?? 0) -
          (sessionOrder.get(b.session_id) ?? 0) ||
        a.start_seconds - b.start_seconds ||
        a.sequence - b.sequence
    );

    const transcriptionCostUsd = chunks.reduce(
      (sum, chunk) =>
        sum + Number(chunk.cost_usd ?? 0) + Number(chunk.prior_cost_usd ?? 0),
      0
    );
    const notesCostUsd = sessions.reduce(
      (sum, session) => sum + Number(session.notes_cost_usd ?? 0),
      0
    );
    const unpricedRequests =
      chunks.reduce((sum, chunk) => sum + (chunk.unpriced_attempts ?? 0), 0) +
      sessions.reduce(
        (sum, session) => sum + session.notes_unpriced_attempts,
        0
      );

    return NextResponse.json(
      {
        ended: true,
        canReadNotes: true,
        canManage,
        sessions: sessions.map((session) => ({
          id: session.id,
          createdAt: session.created_at,
          notesStatus: session.notes_status,
          notes: session.notes,
        })),
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          sessionId: chunk.session_id,
          sequence: chunk.sequence,
          startSeconds: chunk.start_seconds,
          transcript: chunk.transcript,
          status: chunk.status,
        })),
        costs: canManage
          ? {
              transcriptionCostUsd,
              notesCostUsd,
              totalCostUsd: transcriptionCostUsd + notesCostUsd,
              unpricedRequests,
            }
          : null,
      },
      { headers }
    );
  } catch (error) {
    console.error('Failed to read Meet review', {
      meetingId,
      kind: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Meeting review unavailable' },
      { status: 503, headers }
    );
  }
}
