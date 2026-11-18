import 'server-only';
import {
  CHANNEL_FRAME_BYTES,
  channelTicketSchema,
} from '@tuturuuu/realtime/channels';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import {
  type MiraCursor,
  miraAwarenessRemoval,
  miraAwarenessUpdate,
} from '@tuturuuu/realtime/documents';
import type { MiraDocumentSource } from '@tuturuuu/realtime/meet';
import { channelEndpoint, meetingDocumentChannel } from './documents';
import { callRoomService } from './room-service';

type Access = Parameters<typeof callRoomService>[0];
const MIRA_PUBLISHER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Publishes Mira's caret through the channel's service-only publish path.
 * Browser sockets cannot set Mira's identity; this call follows server checks.
 */
async function publishAwareness(
  access: Access,
  tabId: string,
  update: Uint8Array
) {
  const channel = await meetingDocumentChannel(access, tabId);
  const endpoint = channelEndpoint();
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/channels/publish';
  const body = JSON.stringify({
    type: 'broadcast',
    event: 'awareness',
    payload: Array.from(update),
  });
  if (new TextEncoder().encode(body).length > CHANNEL_FRAME_BYTES)
    throw new Error('Awareness frame exceeds limit');
  const ticket = channelTicketSchema.parse({
    aud: 'tuturuuu.channels',
    kind: 'publish',
    topic: channel.topic,
    userId: MIRA_PUBLISHER_ID,
    ownerId: access.meeting.creator_id,
    documentId: channel.documentId,
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + 15,
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signRealtimePayload(ticket, process.env.MEET_REALTIME_TOKEN_SECRET)}`,
      'Content-Type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(5000),
    redirect: 'manual',
    cache: 'no-store',
  });
  await response.arrayBuffer().catch(() => undefined);
  if (!response.ok)
    throw new Error(`Mira awareness failed (${response.status})`);
}

/**
 * Shows Mira in the room's tab state and, best effort, as a named caret in the
 * tab. Live voice tools and chat assist share this path with their source.
 */
export async function showMiraInDocument(
  access: Access,
  input: {
    tabId: string;
    source: MiraDocumentSource;
    status: 'editing' | 'reviewing';
    section?: string;
    statusText?: string;
    cursor?: MiraCursor | null;
  }
) {
  await callRoomService(access, {
    action: 'documents.mira.presence',
    presence: {
      activeTabId: input.tabId,
      source: input.source,
      status: input.status,
      ...(input.section ? { section: input.section } : {}),
    },
  });
  await publishAwareness(
    access,
    input.tabId,
    miraAwarenessUpdate({
      source: input.source,
      activeTabId: input.tabId,
      statusText: input.statusText,
      cursor: input.cursor,
    })
  ).catch(() => {
    console.warn('Mira document caret unavailable');
  });
}

export async function hideMiraInDocument(access: Access, tabId: string) {
  await Promise.allSettled([
    callRoomService(access, {
      action: 'documents.mira.presence',
      presence: null,
    }),
    publishAwareness(access, tabId, miraAwarenessRemoval()),
  ]);
}
