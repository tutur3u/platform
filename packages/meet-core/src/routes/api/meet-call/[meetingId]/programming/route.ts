import {
  createMeetingPlayground,
  executeMeetingPlayground,
  joinMeetingProgramming,
  readMeetingPlaygroundRun,
  readMeetingProgrammingTest,
  setMeetingProgramming,
  testMeetingProgramming,
} from '@tuturuuu/meet-core/features/call/server/programming';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
import { readPersonalChatBody } from '../../../../../features/call/server/personal-chat-body';
import {
  changeMeetingProgrammingMira,
  readMeetingProgrammingMira,
} from '../../../../../features/call/server/programming-mira';

type Context = { params: Promise<{ meetingId: string }> };
export async function GET(request: Request, { params }: Context) {
  await connection();
  const { meetingId } = await params;
  const query = new URL(request.url).searchParams;
  const test = query.get('test');
  const run = query.get('run');
  return roomRoute(request, meetingId, (access) =>
    query.has('mira')
      ? readMeetingProgrammingMira(access)
      : run
        ? readMeetingPlaygroundRun(access, run)
        : test
          ? readMeetingProgrammingTest(access, test)
          : joinMeetingProgramming(access)
  );
}
export async function PUT(request: Request, { params }: Context) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) =>
    setMeetingProgramming(access, await request.json())
  );
}
export async function POST(request: Request, { params }: Context) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const query = new URL(request.url).searchParams;
    if (query.has('checkpoint')) return joinMeetingProgramming(access, true);
    if (query.has('mira'))
      return changeMeetingProgrammingMira(
        access,
        await readPersonalChatBody(request)
      );
    const body = await request.json();
    return query.has('create')
      ? createMeetingPlayground(access, body)
      : query.has('run')
        ? executeMeetingPlayground(access, body)
        : testMeetingProgramming(access, body);
  });
}
