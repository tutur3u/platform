import 'server-only';
import {
  MEET_TRANSCRIPT_NOTICE_VERSION,
  type MeetTranscriptConsentView,
} from '@tuturuuu/realtime/meet';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { MEETING_APP } from '../../../runtime';
import { resolveMeetClassRole } from '../../call/server/class-role';
import {
  callRoomService,
  type MeetCallRouteAccess,
} from '../../call/server/room-service';
import { MeetAiError, type MeetAiParams } from './access';
import { meetPerSpeakerEnabled } from './per-speaker-flag';
import { meetSelfAccess } from './self-v1-access';
import { drainSelfOutbox } from './self-v1-outbox';
import { selfRoom, selfRoomCommands, selfRoomError } from './self-v1-room';
import { readMeetTranscriptionAvailability } from './transcription-availability';

async function roomFor(request: Request, params: MeetAiParams) {
  if (MEETING_APP !== 'meet')
    throw new MeetAiError(
      403,
      'Transcription of your voice is not available',
      'MEET_SELF_UNAVAILABLE'
    );
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new MeetAiError(403, 'Invalid origin');
  const { meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetAiError(400, 'Invalid meeting');
  const user = await getSatelliteAppSessionUser(MEETING_APP);
  if (!user) throw new MeetAiError(401, 'Unauthorized');
  return selfRoom(meetingId, user.id);
}

/** Whether per-speaker capture can run in this meeting's workspace now. */
async function perSpeakerAvailable(wsId: string) {
  const availability = await readMeetTranscriptionAvailability(wsId);
  return availability.available && (await meetPerSpeakerEnabled(wsId));
}

/**
 * Sets the room's capture mode for the next session. Host or co-host only;
 * the room refuses a change while a session is active or draining. Choosing
 * per-speaker needs the flag and allowlist; room capture can always be chosen.
 */
export async function setSelfMode(request: Request, params: MeetAiParams) {
  const room = await roomFor(request, params);
  const parsed = z
    .object({ mode: z.enum(['room', 'self']) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid request');
  const access = room.access as MeetCallRouteAccess & {
    isHost: boolean;
    canReadWorkspace: boolean;
  };
  const { coHost } = await resolveMeetClassRole(access, { required: true });
  if (!access.isHost && !coHost)
    throw new MeetAiError(
      403,
      'Only the host or a co-host can change the capture mode'
    );
  if (
    parsed.data.mode === 'self' &&
    !(await perSpeakerAvailable(access.meeting.ws_id))
  )
    throw new MeetAiError(
      409,
      'Transcription of each voice is not available here',
      'MEET_SELF_UNAVAILABLE'
    );
  const reply = await selfRoomCommands.setMode(room, parsed.data.mode, {
    coHost: !access.isHost && coHost,
  });
  return { mode: reply?.mode === 'self' ? 'self' : parsed.data.mode };
}

const outboxSessions = (pending: unknown) =>
  Array.isArray(pending)
    ? [
        ...new Set(
          pending.flatMap((entry) => {
            const id = (entry as { sessionId?: unknown })?.sessionId;
            return typeof id === 'string' && z.uuid().safeParse(id).success
              ? [id]
              : [];
          })
        ),
      ]
    : [];

/**
 * The participant's own transcript choice in a per-speaker meeting. Declining
 * always records, for anyone in the call. Allowing needs the per-speaker
 * uploader check. The room fences a decline at once; its legal entries are
 * then written for this meeting's per-speaker sessions only.
 */
export async function chooseSelfTranscript(
  request: Request,
  params: MeetAiParams
) {
  const parsed = z
    .object({
      choice: z.enum(['allow', 'decline']),
      version: z.literal(MEET_TRANSCRIPT_NOTICE_VERSION).optional(),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid choice');
  if (parsed.data.choice === 'allow') await meetSelfAccess(request, params);
  const room = await roomFor(request, params);
  let view: MeetTranscriptConsentView & { pending?: unknown };
  try {
    view = await callRoomService(room.access, {
      action: 'transcript.consent.choice',
      choice: parsed.data.choice,
      version: MEET_TRANSCRIPT_NOTICE_VERSION,
    });
  } catch (error) {
    throw selfRoomError(error);
  }
  const { pending, ...consent } = view;
  const sessions = outboxSessions(pending);
  if (sessions.length) {
    const db = await createAdminClient({ noCookie: true });
    const { data } = await db
      .from('meet_ai_sessions')
      .select('id')
      .in('id', sessions)
      .eq('meeting_id', room.access.meeting.id)
      .eq('protocol', 'self_v1');
    for (const { id } of data ?? [])
      await drainSelfOutbox(db, room, id, pending as unknown[]).catch(() => {
        // The room keeps the entries for the next drain point.
        console.warn('[meet-ai] self_v1 choice drain pending');
      });
  }
  return { available: true, ...consent };
}

const sessionSchema = z.object({
  sessionId: z.uuid(),
  protocol: z.enum(['legacy', 'self_v1']),
});

/**
 * Optional per-speaker fields on the transcript-consent read. Missing room
 * fields leave the client in room-capture mode.
 */
export async function readSelfConsentExtras(
  access: MeetCallRouteAccess,
  consent: Record<string, unknown>
) {
  const guest = 'guest' in access && access.guest === true;
  const signedIn = access as MeetCallRouteAccess & {
    isHost: boolean;
    canReadWorkspace: boolean;
  };
  const [available, role] = await Promise.all([
    MEETING_APP === 'meet'
      ? meetPerSpeakerEnabled(access.meeting.ws_id)
      : Promise.resolve(false),
    guest
      ? Promise.resolve({ coHost: false })
      : resolveMeetClassRole(signedIn),
  ]);
  const session = sessionSchema.safeParse(consent.session);
  return {
    mode: consent.mode === 'self' ? ('self' as const) : ('room' as const),
    perSpeakerAvailable: available,
    session: session.success ? session.data : null,
    canManageMode: !guest && (signedIn.isHost || role.coHost),
  };
}
