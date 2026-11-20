import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  guestPollRoomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  MIRA_ROOM_NOTICE_VERSION,
  type MiraRoomFence,
} from '@tuturuuu/realtime/meet';
import { connection } from 'next/server';
import { z } from 'zod';
import { readRoomMiraAvailability } from '../../../../../features/live-assistant/server/room-mira-authority';

type RoomMiraConsent = {
  version: string;
  choice: 'continue' | 'mute' | null;
  pausing: boolean;
  fence: MiraRoomFence;
};
const choice = z
  .object({
    choice: z.enum(['continue', 'mute']),
    version: z.literal(MIRA_ROOM_NOTICE_VERSION),
  })
  .strict();

/**
 * Room Mira notice for every admitted participant, anonymous guests included.
 * Each account records its own choice; the room never accepts one on behalf
 * of someone else. Only aggregate counts are returned, never who is pending.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    if (!(await readRoomMiraAvailability(access))) return { available: false };
    const consent = await callRoomService<RoomMiraConsent>(access, {
      action: 'mira.room.read',
    });
    return { available: true, ...consent };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    const input = choice.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid choice');
    // Mute always records, so anyone can pause room Mira at any time.
    if (
      input.data.choice === 'continue' &&
      !(await readRoomMiraAvailability(access))
    )
      throw new MeetCallAccessError(403, 'Room Mira is unavailable');
    const consent = await callRoomService<RoomMiraConsent>(access, {
      action: 'mira.room.choice',
      ...input.data,
    });
    return { available: true, ...consent };
  });
}
