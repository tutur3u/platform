import {
  isMeetClassroomDeploymentEnabled,
  isMeetClassroomEnabled,
} from '@/features/classroom-tools/access.server';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  meetCallRoomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  classroomMutationSchema,
  classroomReadSchema,
  MAX_CLASSROOM_COMMAND_BYTES,
} from '@tuturuuu/realtime/meet/classroom-tools-schema';

import { connection } from 'next/server';

type Params = { params: Promise<{ meetingId: string }> };

async function readMutation(request: Request) {
  let bytes = 0;
  const body = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_CLASSROOM_COMMAND_BYTES)
          throw new MeetCallAccessError(400, 'Classroom action is too large');
        controller.enqueue(chunk);
      },
    })
  );
  return classroomMutationSchema.parse(await new Response(body).json());
}

async function classroomRoute(
  request: Request,
  params: Params['params'],
  command: () => Promise<unknown> | unknown
) {
  if (!isMeetClassroomDeploymentEnabled())
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  const { meetingId } = await params;
  return meetCallRoomRoute(request, meetingId, true, async (access) => {
    if (!(await isMeetClassroomEnabled(access.meeting.ws_id)))
      throw new MeetCallAccessError(404, 'Classroom tools are unavailable');
    return callRoomService(access, await command(), { classroomTools: true });
  });
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  return classroomRoute(request, params, () => {
    const query = new URL(request.url).searchParams;
    const since = query.get('since');
    return classroomReadSchema.parse({
      action: query.get('action'),
      ...(since === null ? {} : { since }),
    });
  });
}

export function POST(request: Request, { params }: Params) {
  return classroomRoute(request, params, () => readMutation(request));
}
