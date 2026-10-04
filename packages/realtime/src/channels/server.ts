import { signRealtimePayload } from '../core/token';
import {
  type BroadcastMessage,
  CHANNEL_FRAME_BYTES,
  channelTicketSchema,
} from './schema';
/** Called after the owning service authorizes a mutation and determines its fanout. */
export async function publishChannelBroadcast(
  topic: string,
  message: BroadcastMessage,
  options?: { endpoint?: string; secret?: string; fetch?: typeof fetch }
) {
  const endpoint = new URL(
    options?.endpoint ??
      process.env.CLOUDFLARE_CHANNELS_URL ??
      'https://meet-realtime.tuturuuu.com/channels/publish'
  );
  if (endpoint.protocol === 'wss:') endpoint.protocol = 'https:';
  if (endpoint.protocol === 'ws:') endpoint.protocol = 'http:';
  if (
    endpoint.protocol !== 'https:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      endpoint.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(endpoint.hostname)
    )
  )
    throw new Error('Invalid channel publisher endpoint');
  endpoint.pathname = '/channels/publish';
  endpoint.search = '';
  endpoint.hash = '';
  const body = JSON.stringify(message);
  if (new TextEncoder().encode(body).length > CHANNEL_FRAME_BYTES)
    throw new Error('Broadcast exceeds limit');
  const ticket = channelTicketSchema.parse({
    aud: 'tuturuuu.channels',
    kind: 'publish',
    topic,
    userId: '00000000-0000-4000-8000-000000000001',
    role: 'editor',
    exp: Math.floor(Date.now() / 1000) + 15,
  });
  const response = await (options?.fetch ?? fetch)(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signRealtimePayload(ticket, options?.secret ?? process.env.MEET_REALTIME_TOKEN_SECRET)}`,
      'Content-Type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`Cloudflare broadcast failed (${response.status})`);
}
