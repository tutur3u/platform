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

type Context = { params: Promise<{ meetingId: string }> };
export async function GET(request: Request, { params }: Context) {
  await connection();
  const { meetingId } = await params;
  const test = new URL(request.url).searchParams.get('test');
  const run = new URL(request.url).searchParams.get('run');
  return roomRoute(request, meetingId, (access) =>
    run
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
    const body = await request.json();
    return query.has('create')
      ? createMeetingPlayground(access, body)
      : query.has('run')
        ? executeMeetingPlayground(access, body)
        : testMeetingProgramming(access, body);
  });
}
