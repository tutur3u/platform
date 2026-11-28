import { MeetCallAccessError } from '../../../../../../features/call/lib/call-access';
import { requireMeetAiDataConsent } from '../../../../../../features/call/server/ai-data-consent';
import { draftMeetLiveActivity } from '../../../../../../features/call/server/live-activities/mira-activity-draft';
import { roomRoute } from '../../../../../../features/call/server/room-service';

type Params = { params: Promise<{ meetingId: string }> };

const MAX_BODY_BYTES = 16 * 1024;

async function readDraftBody(request: Request): Promise<unknown> {
  const headerLength = request.headers.get('content-length');
  if (headerLength !== null) {
    const parsedLength = Number(headerLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      throw new MeetCallAccessError(413, 'Draft request is too large');
    }
  }
  if (!request.body) {
    throw new MeetCallAccessError(400, 'Invalid draft request');
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new MeetCallAccessError(413, 'Draft request is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    throw new MeetCallAccessError(400, 'Invalid draft request');
  }
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const body = await readDraftBody(request);
    await requireMeetAiDataConsent(request, access.user.id);
    return draftMeetLiveActivity(access, body);
  });
}
