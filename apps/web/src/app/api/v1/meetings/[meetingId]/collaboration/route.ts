import {
  getMeetCallAccessForUser,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import { joinMeetingDocument } from '@tuturuuu/meet-core/features/call/server/documents';
import {
  createMeetingPlayground,
  executeMeetingPlayground,
  joinMeetingProgramming,
  readMeetingPlaygroundRun,
  readMeetingProgrammingTest,
  setMeetingProgramming,
  testMeetingProgramming,
} from '@tuturuuu/meet-core/features/call/server/programming';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const auth = {
  allowAppSessionAuth: { targetApp: 'meet' },
  maxPayloadSize: 3_000_000,
} as const;
const noStore = { 'Cache-Control': 'private, no-store' };
const action = z.enum([
  'document',
  'programming',
  'run',
  'test',
  'select',
  'create',
  'checkpoint',
]);
const GETQuery = z.object({ action: action, id: z.guid().optional() }).strict();
async function response(run: () => Promise<unknown>) {
  try {
    return NextResponse.json(await run(), { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { error: 'Collaboration action unavailable' },
      {
        status:
          error instanceof MeetCallAccessError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,
        headers: noStore,
      }
    );
  }
}
export const GET = withSessionAuth<{ meetingId: string }>(
  async (request, { user }, { meetingId }) => {
    await connection();
    return response(async () => {
      const query = GETQuery.parse(
        Object.fromEntries(new URL(request.url).searchParams)
      );
      const access = await getMeetCallAccessForUser(
        meetingId,
        'Participant',
        user
      );
      if (query.action === 'document') return joinMeetingDocument(access);
      if (query.action === 'programming') return joinMeetingProgramming(access);
      if (query.action === 'run' && query.id)
        return readMeetingPlaygroundRun(access, query.id);
      if (query.action === 'test' && query.id)
        return readMeetingProgrammingTest(access, query.id);
      throw new MeetCallAccessError(400, 'Invalid read action');
    });
  },
  auth
);
export const POST = withSessionAuth<{ meetingId: string }>(
  async (request, { user }, { meetingId }) =>
    response(async () => {
      const body = z
        .object({ action, payload: z.unknown().optional() })
        .strict()
        .parse(await request.json());
      const access = await getMeetCallAccessForUser(
        meetingId,
        'Participant',
        user
      );
      switch (body.action) {
        case 'select':
          return setMeetingProgramming(access, body.payload);
        case 'create':
          return createMeetingPlayground(access, body.payload);
        case 'run':
          return executeMeetingPlayground(access, body.payload);
        case 'test':
          return testMeetingProgramming(access, body.payload);
        case 'checkpoint':
          return joinMeetingProgramming(access, true);
        default:
          throw new MeetCallAccessError(400, 'Invalid write action');
      }
    }),
  auth
);
