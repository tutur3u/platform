import 'server-only';
import { channelTicketSchema } from '@tuturuuu/realtime/channels';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import { accountPrivateRpc } from '@tuturuuu/utils/account-benefits-server';
import { MeetCallAccessError } from '../lib/call-access';
import { callRoomService } from './room-service';

type Access = Parameters<typeof callRoomService>[0];
export async function joinMeetingDocument(access: Access) {
  // A signed room read proves lifecycle and admission before any document lookup.
  await callRoomService(access, { action: 'programming.read' });
  const document = await accountPrivateRpc<{
    documentId: string;
    revision: number;
    state: number[];
  }>('read_meeting_document', { p_meeting_id: access.meeting.id });
  const endpoint = new URL(
    process.env.CLOUDFLARE_CHANNELS_URL ??
      'wss://meet-realtime.tuturuuu.com/channels'
  );
  if (
    endpoint.protocol !== 'wss:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      endpoint.protocol === 'ws:' &&
      ['127.0.0.1', 'localhost'].includes(endpoint.hostname)
    )
  )
    throw new MeetCallAccessError(503, 'Realtime unavailable');
  endpoint.pathname = '/channels';
  endpoint.search = '';
  endpoint.hash = '';
  const ticket = channelTicketSchema.parse({
    aud: 'tuturuuu.channels',
    kind: 'join',
    topic: `meeting-document-${access.meeting.id}`,
    userId: access.user.id,
    ownerId: access.meeting.creator_id,
    documentId: document.documentId,
    version: document.revision,
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  return {
    ...document,
    endpoint: endpoint.toString(),
    token: signRealtimePayload(ticket, process.env.MEET_REALTIME_TOKEN_SECRET),
    role: 'editor' as const,
    user: {
      id: access.user.id,
      user_metadata: { display_name: access.displayName },
    },
  };
}
