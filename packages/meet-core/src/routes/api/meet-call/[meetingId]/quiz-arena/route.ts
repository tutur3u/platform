import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  meetCallRoomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
import { z } from 'zod';
import { requireMeetAiDataConsent } from '../../../../../features/call/server/ai-data-consent';
import {
  quizArenaActionSchema,
  runQuizArenaAction,
} from '../../../../../features/call/server/quiz-arena';

type Params = { params: Promise<{ meetingId: string }> };
const MAX_BODY_BYTES = 64 * 1024;
const sinceQuery = z.strictObject({
  sinceSeq: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const exportQuery = z.strictObject({ format: z.enum(['csv', 'json']) });

async function readQuizArenaAction(request: Request) {
  let bytes = 0;
  const bounded = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BODY_BYTES)
          throw new MeetCallAccessError(400, 'Quiz Arena action is too large');
        controller.enqueue(chunk);
      },
    })
  );
  return quizArenaActionSchema.parse(await new Response(bounded).json());
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return meetCallRoomRoute(request, meetingId, true, async (access) => {
    const query = new URL(request.url).searchParams;
    const entries = Object.fromEntries(query);
    if (query.size === 0)
      return callRoomService(access, { action: 'arena.state' });
    if (query.size === 1 && query.has('sinceSeq')) {
      const parsed = sinceQuery.safeParse(entries);
      if (!parsed.success)
        throw new MeetCallAccessError(400, 'Invalid Quiz Arena request');
      return callRoomService(access, {
        action: 'arena.state',
        sinceSeq: parsed.data.sinceSeq,
      });
    }
    const parsed = exportQuery.safeParse(entries);
    if (query.size !== 1 || !parsed.success)
      throw new MeetCallAccessError(400, 'Invalid Quiz Arena request');
    if (access.guest) throw new MeetCallAccessError(403, 'Forbidden');
    const { format } = parsed.data;
    const result = await callRoomService(access, {
      action: 'arena.export',
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
          'Content-Disposition': `attachment; filename="quiz-arena-${meetingId}.${format}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  });
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return meetCallRoomRoute(request, meetingId, true, async (access) => {
    const action = await readQuizArenaAction(request);
    if (access.guest) {
      if (
        action.action !== 'buzz' &&
        action.action !== 'wager' &&
        action.action !== 'answer'
      )
        throw new MeetCallAccessError(403, 'Forbidden');
      return callRoomService(access, {
        ...action,
        action: `arena.${action.action}`,
      });
    }
    // A generated board sends the host's request to Gemini.
    if (action.action === 'mira_generate_board' && !action.useStarterFallback)
      await requireMeetAiDataConsent(request, access.user.id);
    return runQuizArenaAction(access, action);
  });
}
