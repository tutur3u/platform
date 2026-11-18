import 'server-only';
import { channelTicketSchema } from '@tuturuuu/realtime/channels';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import {
  meetingDocumentTopic,
  ROOM_DOCUMENT_PRIMARY_TAB_ID,
  type RoomDocumentTab,
  type readRoomDocuments,
  roomDocumentKindSchema,
  roomDocumentTabIdSchema,
  roomDocumentTitleSchema,
} from '@tuturuuu/realtime/meet';
import { accountPrivateRpc } from '@tuturuuu/utils/account-benefits-server';
import { z } from 'zod';
import { MeetCallAccessError } from '../lib/call-access';
import { callRoomService } from './room-service';

type Access = Parameters<typeof callRoomService>[0];
export type MeetingDocuments = ReturnType<typeof readRoomDocuments>;

export function channelEndpoint() {
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
  return endpoint;
}

export function readMeetingDocuments(access: Access) {
  // The room authority proves lifecycle and admission before any tab is listed.
  return callRoomService<MeetingDocuments>(access, {
    action: 'documents.read',
  });
}

/** Resolves the channel identity a tab's ticket and Mira's frames must carry. */
export async function meetingDocumentChannel(access: Access, tabId: string) {
  if (tabId === ROOM_DOCUMENT_PRIMARY_TAB_ID) {
    // A signed room read proves lifecycle and admission before any document lookup.
    await callRoomService(access, { action: 'programming.read' });
    const document = await accountPrivateRpc<{
      documentId: string;
      revision: number;
      state: number[];
    }>('read_meeting_document', { p_meeting_id: access.meeting.id });
    return {
      ...document,
      topic: meetingDocumentTopic(access.meeting.id, tabId),
    };
  }
  const documents = await readMeetingDocuments(access);
  if (!documents.tabs.some((tab: RoomDocumentTab) => tab.id === tabId))
    throw new MeetCallAccessError(404, 'Document not found');
  // Tab content lives in its channel room; the join replays it on connect.
  return {
    documentId: tabId,
    revision: 0,
    state: [] as number[],
    topic: meetingDocumentTopic(access.meeting.id, tabId),
  };
}

export async function joinMeetingDocument(
  access: Access,
  tabId: string = ROOM_DOCUMENT_PRIMARY_TAB_ID
) {
  const { topic, ...document } = await meetingDocumentChannel(access, tabId);
  const ticket = channelTicketSchema.parse({
    aud: 'tuturuuu.channels',
    kind: 'join',
    topic,
    userId: access.user.id,
    ownerId: access.meeting.creator_id,
    documentId: document.documentId,
    version: document.revision,
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  return {
    ...document,
    tabId,
    endpoint: channelEndpoint().toString(),
    token: signRealtimePayload(ticket, process.env.MEET_REALTIME_TOKEN_SECRET),
    role: 'editor' as const,
    user: {
      id: access.user.id,
      user_metadata: { display_name: access.displayName },
    },
  };
}

export function readDocumentTabParam(request: Request) {
  const value = new URL(request.url).searchParams.get('tab');
  if (value === null) return ROOM_DOCUMENT_PRIMARY_TAB_ID;
  const parsed = roomDocumentTabIdSchema.safeParse(value);
  if (!parsed.success) throw new MeetCallAccessError(400, 'Invalid document');
  return parsed.data;
}

/** Browser commands; Mira presence and edit records are never accepted here. */
export const meetingDocumentCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      kind: roomDocumentKindSchema,
      title: roomDocumentTitleSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('rename'),
      tabId: roomDocumentTabIdSchema,
      title: roomDocumentTitleSchema.nullable(),
    })
    .strict(),
  z.object({ action: z.literal('close'), tabId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('review'),
      editId: z.uuid(),
      decision: z.enum(['accepted', 'reverted']),
    })
    .strict(),
]);
export type MeetingDocumentCommand = z.infer<
  typeof meetingDocumentCommandSchema
>;

export function runMeetingDocumentCommand(
  access: Access,
  command: MeetingDocumentCommand
) {
  const room =
    command.action === 'create'
      ? {
          action: 'documents.create',
          tab: {
            id: crypto.randomUUID(),
            kind: command.kind,
            ...(command.title ? { title: command.title } : {}),
          },
        }
      : command.action === 'rename'
        ? {
            action: 'documents.rename',
            tabId: command.tabId,
            title: command.title,
          }
        : command.action === 'close'
          ? { action: 'documents.close', tabId: command.tabId }
          : {
              action: 'documents.mira.review',
              editId: command.editId,
              decision: command.decision,
            };
  return callRoomService<MeetingDocuments>(access, room);
}
