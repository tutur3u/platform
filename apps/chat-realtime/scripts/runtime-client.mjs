// Test client helpers for the chat-realtime workerd runtime checks.
import {
  chatRealtimeBodyDigest,
  signChatRealtimeTicket,
} from '../../../packages/realtime/src/chat/ticket.ts';

export const SECRET = 'runtime-fixture-only-chat-realtime-secret-000';
export const WS = '00000000-0000-4000-8000-0000000000a1';
export const CONVERSATION = '00000000-0000-4000-8000-0000000000c1';
export const ALICE = '00000000-0000-4000-8000-000000000001';
export const BOB = '00000000-0000-4000-8000-000000000002';

const now = () => Math.floor(Date.now() / 1000);

export function subscribeTicket({
  userId,
  room = 'inbox',
  conversationId,
  iat = now(),
  exp = now() + 600,
  wsId = WS,
}) {
  return signChatRealtimeTicket(
    {
      aud: 'chat-realtime',
      ...(room === 'conversation' ? { conversationId } : {}),
      exp,
      iat,
      kind: 'subscribe',
      room,
      userId,
      v: 1,
      wsId,
    },
    SECRET
  );
}

/** Opens a socket and records frames; resolves once the server says ready. */
export async function openSocket(origin, ticket, { since } = {}) {
  const url = new URL('/v1/connect', origin.replace(/^http/u, 'ws'));
  if (since !== undefined) url.searchParams.set('since', String(since));
  const socket = new WebSocket(url, ['tuturuuu.chat.v1', `ticket.${ticket}`]);
  const frames = [];
  const waiters = new Set();
  const closed = new Promise((resolve) => {
    socket.addEventListener('close', (event) =>
      resolve({ code: event.code, reason: event.reason })
    );
  });
  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(event.data);
    frames.push(frame);
    for (const waiter of [...waiters]) waiter();
  });
  const client = {
    socket,
    frames,
    closed,
    send: (frame) => socket.send(JSON.stringify(frame)),
    close: () => socket.close(1000),
    /** Waits for the first recorded frame matching `match`. */
    next(match, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const found = frames.find(match);
          if (!found) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(found);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(
            new Error(
              `Timed out; frames: ${JSON.stringify(frames).slice(0, 800)}`
            )
          );
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
  };
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await client.next((frame) => frame.t === 'ready');
  return client;
}

export function messageEvent(
  type,
  { audience, conversationId = CONVERSATION, id, wsId = WS, ...rest } = {}
) {
  return {
    actorUserId: ALICE,
    audience: audience ?? { scope: 'users', userIds: [ALICE, BOB] },
    conversationId,
    id: id ?? crypto.randomUUID(),
    message: { id: crypto.randomUUID(), content: 'hello' },
    sentAt: new Date().toISOString(),
    type,
    wsId,
    ...rest,
  };
}

export async function publish(
  server,
  event,
  { ticketBody, wsId = WS, kind = 'publish' } = {}
) {
  const body = JSON.stringify(event);
  const iat = now();
  const token =
    kind === 'publish'
      ? await signChatRealtimeTicket(
          {
            aud: 'chat-realtime',
            bodySha256: await chatRealtimeBodyDigest(ticketBody ?? body),
            exp: iat + 60,
            iat,
            kind: 'publish',
            v: 1,
            wsId,
          },
          SECRET
        )
      : await subscribeTicket({ userId: ALICE });
  return server.fetch('/v1/publish', {
    body,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}
