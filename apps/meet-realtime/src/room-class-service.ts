import {
  applyMeetClassService,
  type MeetClassFeatures,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';
import type { MeetRealtimeServerMessage } from '../../../packages/realtime/src/meet/messages';
import { verifyMeetServiceCredential } from '../../../packages/realtime/src/meet/service-credential';

export async function handleMeetClassServiceRequest(input: {
  request: Request;
  secret: string;
  features: MeetClassFeatures;
  snapshot: MeetRoomSnapshot;
  now: string;
  existed?: boolean;
  commit: (
    snapshot: MeetRoomSnapshot,
    broadcast: MeetRealtimeServerMessage[]
  ) => Promise<void>;
  rememberRoom?: (roomId: string) => void;
}): Promise<Response> {
  const credential =
    input.request.headers
      .get('Authorization')
      ?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? '';
  const claims = verifyMeetServiceCredential(credential, input.secret);
  if (!claims) return new Response('Unauthorized', { status: 401 });
  input.rememberRoom?.(claims.roomId);
  const result = applyMeetClassService(
    input.snapshot,
    claims,
    input.features,
    input.now,
    input.existed !== false
  );
  if (result.persist || result.broadcast.length)
    await input.commit(result.snapshot, result.broadcast);
  if (result.status === 404) return new Response(null, { status: 404 });
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
