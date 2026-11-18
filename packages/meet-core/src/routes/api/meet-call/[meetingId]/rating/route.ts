import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  roomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { readLiveRequestBody } from '@tuturuuu/meet-core/features/live-assistant/request-body';
import { connection } from 'next/server';
import { z } from 'zod';

type Params = { params: Promise<{ meetingId: string }> };
const MAX_RATING_BODY_BYTES = 1024;
const ratingInput = z.object({ value: z.number().int().min(1).max(5) });

/** The caller's own post-call rating; the room decides who attended. */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return roomRoute(request, meetingId, (access) =>
    callRoomService<{ rating: number | null }>(access, {
      action: 'rating.read',
    })
  );
}

export async function PUT(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const body =
      Number(request.headers.get('content-length')) > MAX_RATING_BODY_BYTES
        ? { ok: false as const, status: 413 }
        : await readLiveRequestBody(request, MAX_RATING_BODY_BYTES);
    if (!body.ok)
      throw new MeetCallAccessError(
        body.status,
        body.status === 413 ? 'Rating request is too large' : 'Invalid rating'
      );
    const input = ratingInput.safeParse(body.data);
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid rating');
    return callRoomService<{ rating: number }>(access, {
      action: 'rating.set',
      value: input.data.value,
    });
  });
}
