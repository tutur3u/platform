// Hosted smoke for the chat-realtime staging Worker.
//
//   CHAT_REALTIME_SMOKE_ORIGIN=https://… CHAT_REALTIME_SMOKE_SECRET=… \
//     node apps/chat-realtime/scripts/staging-smoke.mjs --phase=live|stopped
//
// `live` signs a subscribe ticket, connects, publishes one event and checks it
// arrives, then checks the publish bounds: a subscribe ticket, a body digest
// mismatch, a foreign signing key and an oversized body are all refused.
// `stopped` checks the stop fence: health reports stopped and connect and
// publish return 503. Synthetic workspace, conversation and user IDs keep the
// smoke in its own rooms. Output names checks only, never the origin or secret.
import { pathToFileURL } from 'node:url';
import {
  chatRealtimeBodyDigest,
  signChatRealtimeTicket,
} from '../../../packages/realtime/src/chat/ticket.ts';
import { openSocket } from './runtime-client.mjs';

export const SMOKE_WS = '00000000-0000-4000-8000-00000000c5a1';
export const SMOKE_CONVERSATION = '00000000-0000-4000-8000-00000000c5c1';
export const SMOKE_USER = '00000000-0000-4000-8000-00000000c501';
const SMOKE_PEER = '00000000-0000-4000-8000-00000000c502';
const TIMEOUT_MS = 15_000;

const now = () => Math.floor(Date.now() / 1000);

export function subscribe(secret) {
  const iat = now();
  return signChatRealtimeTicket(
    {
      aud: 'chat-realtime',
      exp: iat + 300,
      iat,
      kind: 'subscribe',
      room: 'inbox',
      userId: SMOKE_USER,
      v: 1,
      wsId: SMOKE_WS,
    },
    secret
  );
}

export function smokeEvent(extra = {}) {
  return {
    actorUserId: SMOKE_USER,
    audience: { scope: 'users', userIds: [SMOKE_USER, SMOKE_PEER] },
    conversationId: SMOKE_CONVERSATION,
    id: crypto.randomUUID(),
    message: { id: crypto.randomUUID(), content: 'staging smoke' },
    sentAt: new Date().toISOString(),
    type: 'message.created',
    wsId: SMOKE_WS,
    ...extra,
  };
}

async function publishTicket(secret, digestOf) {
  const iat = now();
  return signChatRealtimeTicket(
    {
      aud: 'chat-realtime',
      bodySha256: await chatRealtimeBodyDigest(digestOf),
      exp: iat + 60,
      iat,
      kind: 'publish',
      v: 1,
      wsId: SMOKE_WS,
    },
    secret
  );
}

function post(origin, body, token) {
  return fetch(new URL('/v1/publish', origin), {
    body,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function health(origin) {
  const response = await fetch(new URL('/health', origin), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.ok ? response.json() : { status: response.status };
}

function check(results, name, ok) {
  results.push({ name, ok: Boolean(ok) });
}

export async function runLive({ origin, secret }) {
  const results = [];
  check(results, 'health reports running', (await health(origin)).stopped === false);

  let client;
  try {
    client = await openSocket(origin, await subscribe(secret));
    check(results, 'signed ticket connects', true);
  } catch {
    check(results, 'signed ticket connects', false);
    return results;
  }
  try {
    const event = smokeEvent();
    const body = JSON.stringify(event);
    const accepted = await post(origin, body, await publishTicket(secret, body));
    check(results, 'signed publish accepted', accepted.status === 200);
    const delivered = await client
      .next((f) => f.t === 'event' && f.event?.id === event.id, TIMEOUT_MS)
      .then(
        () => true,
        () => false
      );
    check(results, 'published event delivered', delivered);
  } finally {
    client.close();
  }

  const body = JSON.stringify(smokeEvent());
  check(
    results,
    'subscribe ticket cannot publish',
    (await post(origin, body, await subscribe(secret))).status === 401
  );
  check(
    results,
    'body digest mismatch refused',
    (await post(origin, body, await publishTicket(secret, '{}'))).status === 401
  );
  const foreign = crypto.randomUUID() + crypto.randomUUID();
  check(
    results,
    'foreign signing key refused',
    (await post(origin, body, await publishTicket(foreign, body))).status ===
      401
  );
  const huge = JSON.stringify(
    smokeEvent({ message: { content: 'x'.repeat(70 * 1024) } })
  );
  check(
    results,
    'oversized publish refused',
    (await post(origin, huge, await publishTicket(secret, huge))).status === 413
  );
  return results;
}

export async function runStopped({ origin, secret }) {
  const results = [];
  check(results, 'health reports stopped', (await health(origin)).stopped === true);
  const body = JSON.stringify(smokeEvent());
  check(
    results,
    'publish fenced',
    (await post(origin, body, await publishTicket(secret, body))).status === 503
  );
  // The fence answers before routing, so a plain connect request reports it
  // directly (a running Worker answers 426 for a missing upgrade).
  const connect = await fetch(new URL('/v1/connect', origin), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  check(results, 'connect fenced', connect.status === 503);
  const opened = await openSocket(origin, await subscribe(secret)).then(
    (client) => {
      client.close();
      return true;
    },
    () => false
  );
  check(results, 'fenced socket never opens', !opened);

  return results;
}

export function readSmokeConfig(env = process.env) {
  const origin = env.CHAT_REALTIME_SMOKE_ORIGIN ?? '';
  const secret = env.CHAT_REALTIME_SMOKE_SECRET ?? '';
  const url = URL.canParse(origin) ? new URL(origin) : null;
  if (!url || url.protocol !== 'https:' || url.pathname !== '/' || url.search) {
    throw new Error('CHAT_REALTIME_SMOKE_ORIGIN must be a bare HTTPS origin');
  }
  if (secret.trim().length < 32) {
    throw new Error('CHAT_REALTIME_SMOKE_SECRET must be at least 32 characters');
  }
  return { origin: url.origin, secret };
}

async function main() {
  const phase = process.argv
    .find((arg) => arg.startsWith('--phase='))
    ?.slice('--phase='.length);
  if (phase !== 'live' && phase !== 'stopped') {
    throw new Error('--phase must be live or stopped');
  }
  const config = readSmokeConfig();
  const results =
    phase === 'live' ? await runLive(config) : await runStopped(config);
  for (const { name, ok } of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (results.some(({ ok }) => !ok)) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : 'smoke'}`);
    process.exit(1);
  });
}
