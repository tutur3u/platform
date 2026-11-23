import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  guestPollRoomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  MEET_TRANSCRIPT_NOTICE_VERSION,
  type MeetTranscriptConsentView,
} from '@tuturuuu/realtime/meet';
import { connection } from 'next/server';
import { z } from 'zod';
import { readMeetTranscriptionAvailability } from '../../../../../features/meeting-ai/server/transcription-availability';

const choice = z
  .object({
    choice: z.enum(['allow', 'decline']),
    version: z.literal(MEET_TRANSCRIPT_NOTICE_VERSION),
  })
  .strict();

/**
 * Live transcript notice for every admitted participant, anonymous guests
 * included. Each account records its own choice; the room never accepts one
 * on behalf of someone else. Only aggregate counts are returned.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    const availability = await readMeetTranscriptionAvailability(
      access.meeting.ws_id
    );
    if (!availability.available) return availability;
    const consent = await callRoomService<MeetTranscriptConsentView>(access, {
      action: 'transcript.consent.read',
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
    // Decline always records, so anyone can pause the transcript at any time.
    if (input.data.choice === 'allow') {
      const availability = await readMeetTranscriptionAvailability(
        access.meeting.ws_id
      );
      if (!availability.available)
        throw new MeetCallAccessError(403, 'Live transcript is unavailable');
    }
    const consent = await callRoomService<MeetTranscriptConsentView>(access, {
      action: 'transcript.consent.choice',
      ...input.data,
    });
    return { available: true, ...consent };
  });
}
