import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  roomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
import { z } from 'zod';

type Params = { params: Promise<{ meetingId: string }> };
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
    const input = ratingInput.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid rating');
    return callRoomService<{ rating: number }>(access, {
      action: 'rating.set',
      value: input.data.value,
    });
  });
}
