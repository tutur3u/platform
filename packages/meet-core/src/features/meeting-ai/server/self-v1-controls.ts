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
import { MeetAiError, type MeetAiParams, meetAiResponse } from './access';
import { meetPerSpeakerEnabled } from './per-speaker-flag';
import { meetSelfAccess, resolveSelfWorkspace } from './self-v1-access';
import { drainSelfOutbox } from './self-v1-outbox';
import { listSelfCoverage } from './self-v1-reads';
import {
  type MeetSelfRoom,
  selfRoom,
  selfRoomCommands,
  selfRoomError,
} from './self-v1-room';
import { readMeetTranscriptionAvailability } from './transcription-availability';
import { requireShownSelfNotice } from './self-v1-notice';
import { withoutPending } from './self-v1-view';

/**
 * The caller's own room channel for a self control, checked in order before
 * any body is read: Meet only, same origin, a valid meeting id and
 * workspace segment, the Meet session, the route workspace resolved for the
 * caller, and the meeting belonging to that workspace.
 */
async function roomFor(request: Request, params: MeetAiParams) {
  if (MEETING_APP !== 'meet')
    throw new MeetAiError(
      403,
      'Transcription of your voice is not available',
      'MEET_SELF_UNAVAILABLE'
    );
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new MeetAiError(403, 'Invalid origin');
  const { wsId: rawWsId, meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetAiError(400, 'Invalid meeting');
  const user = await getSatelliteAppSessionUser(MEETING_APP);
  if (!user) throw new MeetAiError(401, 'Unauthorized');
  const wsId = await resolveSelfWorkspace(
    await createAdminClient({ noCookie: true }),
    user,
    rawWsId
  );
  const room = await selfRoom(meetingId, user.id, user);
  if (room.access.meeting.ws_id !== wsId)
    throw new MeetAiError(404, 'Meeting not found');
  return room;
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

/** SHA-256 hex of the exact notice text shown, and its locale. */
const evidence = {
  noticeVersion: z.string().min(1).max(80),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
};

/**
 * Allow carries the per-speaker notice evidence and must name the current
 * notice; decline needs nothing and always records.
 */
export const selfChoiceSchema = z.discriminatedUnion('choice', [
  z
    .object({
      choice: z.literal('allow'),
      noticeVersion: z.literal(MEET_TRANSCRIPT_NOTICE_VERSION),
      locale: evidence.locale,
      textHash: evidence.textHash,
    })
    .strict(),
  z
    .object({
      choice: z.literal('decline'),
      noticeVersion: evidence.noticeVersion.optional(),
      locale: evidence.locale.optional(),
      textHash: evidence.textHash.optional(),
    })
    .strict(),
]);

/**
 * The participant's own transcript choice in a per-speaker meeting. Declining
 * always records, for anyone in the call. Allowing needs the current notice
 * uploader check (flag, allowlist, pilot membership), then the notice
 * evidence, whose hash must match the text shown in its locale. Access and
 * workspace checks run before the body is read. The room fences a decline at
 * once; its legal entries are then written for this meeting's per-speaker
 * sessions only.
 */
export async function chooseSelfTranscript(
  request: Request,
  params: MeetAiParams
) {
  // Origin, session, workspace and meeting first; only then the body.
  const room = await roomFor(request, params);
  const parsed = selfChoiceSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) throw new MeetAiError(400, 'Invalid choice');
  if (parsed.data.choice === 'allow') {
    // The flag, allowlist and pilot membership before the notice evidence.
    await meetSelfAccess(request, params);
    await requireShownSelfNotice(parsed.data);
  }
  return recordSelfChoice(
    room,
    parsed.data.choice,
    parsed.data.choice === 'allow'
      ? {
          locale: parsed.data.locale,
          textHash: parsed.data.textHash,
          noticeVersion: parsed.data.noticeVersion,
        }
      : undefined
  );
}

/**
 * The transcript-consent POST in a room set to per-speaker capture: the room
 * records a decline for this account only and never starts room capture, so
 * declining works through every path. Allow needs the per-speaker notice
 * evidence and is accepted only on the per-speaker choice route. Returns null
 * in room mode, where the consent route keeps its room-capture behaviour.
 */
export async function selfModeConsentChoice(
  _request: Request,
  access: MeetCallRouteAccess,
  choice: 'allow' | 'decline'
): Promise<Response | null> {
  if (MEETING_APP !== 'meet') return null;
  const read = await callRoomService<{ mode?: unknown }>(access, {
    action: 'transcript.consent.read',
  });
  if (read?.mode !== 'self') return null;
  return meetAiResponse(async () => {
    if (choice === 'allow')
      throw new MeetAiError(
        409,
        'Allow transcription of your voice from its notice',
        'MEET_SELF_EVIDENCE_REQUIRED'
      );
    return recordSelfChoice({ access, accountId: access.user.id }, choice);
  });
}

/** Sends the caller's own choice to the room, then writes its legal entries. */
async function recordSelfChoice(
  room: MeetSelfRoom,
  choice: 'allow' | 'decline',
  notice?: { locale: string; textHash: string; noticeVersion: string }
) {
  let view: MeetTranscriptConsentView & { pending?: unknown };
  try {
    // A per-speaker Allow carries the shown notice evidence to the room.
    view = await callRoomService(room.access, {
      action: 'transcript.consent.choice',
      choice,
      version: MEET_TRANSCRIPT_NOTICE_VERSION,
      ...(notice ? { notice } : {}),
    });
  } catch (error) {
    throw selfRoomError(error);
  }
  const { pending } = view;
  const consent = withoutPending(view);
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
  return {
    available: true,
    ...consent,
    ...(await consentViewExtras(room.access, consent)),
  };
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
  const available =
    MEETING_APP === 'meet'
      ? await meetPerSpeakerEnabled(access.meeting.ws_id)
      : false;
  const session = sessionSchema.safeParse(consent.session);
  // The room decides host and co-host rights; a guest never manages the mode.
  const canManageMode = !guest && consent.canManageMode === true;
  // Host and co-host see who contributes, never why someone does not.
  const coverage =
    canManageMode && session.success && session.data.protocol === 'self_v1'
      ? await listSelfCoverage(
          await createAdminClient({ noCookie: true }),
          session.data.sessionId,
          access.user.id
        )
          .then((rows) =>
            rows.map((row) => ({
              accountId: row.account_id,
              contributing: row.coverage === 'contributing',
            }))
          )
          .catch(() => undefined)
      : undefined;
  return {
    mode: consent.mode === 'self' ? ('self' as const) : ('room' as const),
    perSpeakerAvailable: available,
    session: session.success ? session.data : null,
    canManageMode,
    ...(coverage ? { coverage } : {}),
  };
}

/**
 * The per-speaker fields for a consent view, or room mode when they cannot
 * be read, so a failed read never turns capture on.
 */
export function consentViewExtras(
  access: MeetCallRouteAccess,
  consent: Record<string, unknown>
) {
  return readSelfConsentExtras(access, consent).catch(() => ({
    mode: 'room' as const,
    perSpeakerAvailable: false,
    session: null,
    canManageMode: false,
  }));
}
