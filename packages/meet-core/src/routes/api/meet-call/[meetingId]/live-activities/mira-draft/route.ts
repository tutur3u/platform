import { MeetCallAccessError } from '../../../../../../features/call/lib/call-access';
import { draftMeetLiveActivity } from '../../../../../../features/call/server/live-activities/mira-activity-draft';
import { roomRoute } from '../../../../../../features/call/server/room-service';

type Params = { params: Promise<{ meetingId: string }> };

const MAX_BODY_BYTES = 16 * 1024;

async function readDraftBody(request: Request): Promise<unknown> {
  let bytes = 0;
  const bounded = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          throw new MeetCallAccessError(400, 'Draft request is too large');
        }
        controller.enqueue(chunk);
      },
    })
  );
  if (!bounded) {
    throw new MeetCallAccessError(400, 'Invalid draft request');
  }
  return new Response(bounded).json();
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const body = await readDraftBody(request);
    return draftMeetLiveActivity(access, body);
  });
}
