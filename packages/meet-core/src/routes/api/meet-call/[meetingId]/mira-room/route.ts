import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  guestPollRoomRoute,
  type MeetCallRouteAccess,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  MIRA_ROOM_CAPABILITIES,
  MIRA_ROOM_NOTICE_VERSION,
  type MiraRoomView,
} from '@tuturuuu/realtime/meet';
import { connection } from 'next/server';
import { z } from 'zod';
import {
  acceptRoomMira,
  endRoomMira,
} from '../../../../../features/live-assistant/server/room-mira-acceptance';
import { readRoomMiraAvailability } from '../../../../../features/live-assistant/server/room-mira-authority';
import {
  readMiraBoxTickedByDefault,
  recordMiraChoice,
} from '../../../../../features/live-assistant/server/room-mira-evidence';

const command = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('choice'),
      choice: z.enum(['on', 'off']),
      version: z.literal(MIRA_ROOM_NOTICE_VERSION),
      acceptanceRevision: z.number().int().nonnegative(),
      source: z.enum(['join', 'confirm', 'toggle']),
      // SHA-256 hex of the exact notice text shown, and its locale.
      textHash: z.string().regex(/^[0-9a-f]{64}$/),
      locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('accept'),
      capabilities: z
        .array(z.enum(MIRA_ROOM_CAPABILITIES))
        .min(1)
        .max(MIRA_ROOM_CAPABILITIES.length),
      audienceAdultConfirmed: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal('end') }).strict(),
  z.object({ action: z.literal('report_minor') }).strict(),
]);

const isGuest = (access: MeetCallRouteAccess) =>
  'guest' in access && access.guest === true;

async function readView(access: MeetCallRouteAccess) {
  const [view, boxTickedByDefault] = await Promise.all([
    callRoomService<MiraRoomView>(access, { action: 'mira.room.read' }),
    readMiraBoxTickedByDefault(access.meeting.ws_id),
  ]);
  return { available: true as const, ...view, boxTickedByDefault };
}

/**
 * Room Mira for every admitted participant, anonymous guests included. Each
 * account records only its own choice; the host or a co-host accepts for the
 * meeting. Only aggregate counts are returned, never who is on or off.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    if (!(await readRoomMiraAvailability(access))) return { available: false };
    return readView(access);
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    const input = command.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid request');
    const data = input.data;
    if (data.action === 'accept') {
      await acceptRoomMira(access, data.capabilities);
      return readView(access);
    }
    if (data.action === 'end' || data.action === 'report_minor') {
      await endRoomMira(
        access,
        data.action === 'end' ? 'turned_off' : 'minor_reported'
      );
      return readView(access);
    }
    // Off always records, so anyone can turn Mira off for themselves.
    if (data.choice === 'on' && !(await readRoomMiraAvailability(access)))
      throw new MeetCallAccessError(403, 'Room Mira is unavailable');
    await callRoomService(access, {
      action: 'mira.room.choice',
      choice: data.choice,
      version: data.version,
      acceptanceRevision: data.acceptanceRevision,
    });
    try {
      await recordMiraChoice({
        meetingId: access.meeting.id,
        wsId: access.meeting.ws_id,
        participantId: access.user.id,
        guest: isGuest(access),
        choice: data.choice,
        source: data.source,
        acceptanceRevision: data.acceptanceRevision,
        noticeVersion: data.version,
        textHash: data.textHash,
        locale: data.locale,
      });
    } catch (error) {
      console.error('Room Mira choice evidence failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
      // On counts only with durable evidence; fall back to off.
      if (data.choice === 'on') {
        await callRoomService(access, {
          action: 'mira.room.choice',
          choice: 'off',
          version: data.version,
          acceptanceRevision: data.acceptanceRevision,
        });
        throw new MeetCallAccessError(503, 'Your choice could not be saved');
      }
    }
    return readView(access);
  });
}
