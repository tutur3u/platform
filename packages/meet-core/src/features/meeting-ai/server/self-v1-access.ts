import 'server-only';
import { isParleySession } from '@tuturuuu/meet-core/parley/repository';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  resolveWorkspaceIdForPrincipal,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams } from './access';
import { meetPerSpeakerEnabled } from './per-speaker-flag';
import type { MeetAiSessionRow } from './self-v1-rpc';
import { readMeetTranscriptionAvailability } from './transcription-availability';

export type MeetSelfAccess = {
  db: TypedSupabaseClient;
  user: { id: string };
  wsId: string;
  meetingId: string;
  isHost: boolean;
};

const unavailable = () =>
  new MeetAiError(
    403,
    'Transcription of your voice is not available',
    'MEET_SELF_UNAVAILABLE'
  );

/**
 * The per-speaker uploader check. It never uses the host-only Meet AI
 * access: any admitted pilot member may upload their own voice. In order:
 * Meet only, same origin, the Meet app session, the meeting and workspace
 * resolved server-side, transcription availability (kill switch, workspace
 * gate, 18+ declaration), the per-speaker flag and allowlist, and workspace
 * membership for the pilot. Runs before any limiter, credit, row or
 * provider work.
 */
export async function meetSelfAccess(
  request: Request,
  params: MeetAiParams
): Promise<MeetSelfAccess> {
  if (MEETING_APP !== 'meet') throw unavailable();
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new MeetAiError(403, 'Invalid origin');
  const user = await getSatelliteAppSessionUser(MEETING_APP);
  if (!user) throw new MeetAiError(401, 'Unauthorized');
  const { wsId: rawWsId, meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetAiError(400, 'Invalid meeting');
  const db = await createAdminClient();
  let resolvedWsId: string;
  try {
    resolvedWsId = await resolveWorkspaceIdForPrincipal({
      authorizationClient: db,
      principal: { id: user.id, email: user.email ?? null },
      wsId: rawWsId,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new MeetAiError(
      name === 'WorkspaceAuthError'
        ? 403
        : name === 'WorkspaceNotFoundError'
          ? 404
          : 500,
      'Workspace resolution failed'
    );
  }
  const { data: meeting, error } = await db
    .from('workspace_meetings')
    .select('id, creator_id, ws_id')
    .eq('id', meetingId)
    .eq('ws_id', resolvedWsId)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Meeting lookup failed');
  if (!meeting) throw new MeetAiError(404, 'Meeting not found');
  const wsId = meeting.ws_id;
  if (!(await readMeetTranscriptionAvailability(wsId)).available)
    throw new MeetAiError(
      403,
      'Meet AI is temporarily unavailable',
      'MEET_AI_WORKSPACE_NOT_ENABLED'
    );
  if (!(await meetPerSpeakerEnabled(wsId))) throw unavailable();
  if (await isParleySession(meetingId, false)) throw unavailable();
  const membership = await verifyWorkspaceMembershipType({
    supabase: db,
    userId: user.id,
    wsId,
    requiredType: 'MEMBER',
  });
  if (membership.error === 'membership_lookup_failed')
    throw new MeetAiError(500, 'Workspace access lookup failed');
  // Pilot: only signed-in members of the allowlisted workspace contribute.
  if (!membership.ok) throw unavailable();
  return {
    db,
    user: { id: user.id },
    wsId,
    meetingId: meeting.id,
    isHost: meeting.creator_id === user.id,
  };
}

/**
 * Loads a self_v1 session by id and meeting, never by uploader. `upload`
 * accepts `active`, or `draining` before its drain deadline; `open` needs
 * `active`. Both need a fixed host and payer and an unexpired capture
 * deadline.
 */
export async function loadSelfSession(
  db: TypedSupabaseClient,
  input: { sessionId: string; meetingId: string; wsId: string },
  phase: 'open' | 'upload'
): Promise<MeetAiSessionRow & { user_id: string; billing_host_id: string }> {
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('id', input.sessionId)
    .eq('meeting_id', input.meetingId)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  if (session.protocol !== 'self_v1')
    throw new MeetAiError(
      409,
      'This session does not accept per-speaker audio',
      'MEET_SELF_PROTOCOL_MISMATCH'
    );
  if (
    !session.user_id ||
    !session.billing_host_id ||
    session.billing_ws_id !== input.wsId
  )
    throw new MeetAiError(409, 'Transcription has ended');
  const now = Date.now();
  const deadline = session.capture_deadline_at
    ? Date.parse(session.capture_deadline_at)
    : Number.NaN;
  const draining =
    phase === 'upload' &&
    session.capture_state === 'draining' &&
    !!session.drain_deadline_at &&
    Date.parse(session.drain_deadline_at) > now;
  if (
    !(deadline > now) ||
    session.ended_at ||
    !(session.capture_state === 'active' || draining)
  )
    throw new MeetAiError(409, 'Transcription has ended');
  return session as MeetAiSessionRow & {
    user_id: string;
    billing_host_id: string;
  };
}
