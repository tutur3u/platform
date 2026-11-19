import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  guestPollRoomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
import { z } from 'zod';
import {
  pollActionSchema,
  runPollAction,
} from '../../../../../features/call/server/polls';

type Params = { params: Promise<{ meetingId: string }> };
const exportQuery = z.strictObject({
  format: z.enum(['csv', 'json']),
  pollId: z.uuid(),
});
const MAX_BODY_BYTES = 8192;

async function readPollAction(request: Request) {
  let bytes = 0;
  const bounded = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BODY_BYTES)
          throw new MeetCallAccessError(400, 'Poll action is too large');
        controller.enqueue(chunk);
      },
    })
  );
  return pollActionSchema.parse(await new Response(bounded).json());
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    const query = new URL(request.url).searchParams;
    if (query.size === 0)
      return callRoomService(access, { action: 'poll.list' });
    const parsed = exportQuery.safeParse({
      format: query.get('format'),
      pollId: query.get('pollId'),
    });
    if (query.size !== 2 || !parsed.success)
      throw new MeetCallAccessError(400, 'Invalid poll export request');
    const { format, pollId } = parsed.data;
    const result = await callRoomService(access, {
      action: 'poll.export',
      pollId,
      format,
    });
    return new Response(
      format === 'csv' && typeof result === 'string'
        ? result
        : JSON.stringify(result),
      {
        headers: {
          'Content-Type':
            format === 'csv'
              ? 'text/csv; charset=utf-8'
              : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="poll-${pollId}.${format}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  });
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) =>
    runPollAction(access, await readPollAction(request))
  );
}
