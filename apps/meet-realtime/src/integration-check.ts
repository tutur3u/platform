/**
 * End-to-end check of the meet realtime stack against the real Cloudflare
 * Realtime SFU.
 *
 *   set -a && . apps/meet-realtime/.dev.vars && set +a \
 *     && bun apps/meet-realtime/src/integration-check.ts
 *
 * Boots the room server on a scratch port, connects a host and a guest over
 * WebSockets with signed tokens, and asserts the room behaviours the UI depends
 * on. Nothing derived from the app secret is printed.
 */
import {
  getMeetRealtimeScopesForRole,
  type MeetRealtimeRole,
  type MeetRealtimeServerMessage,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { signMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import { createMeetRealtimeServer } from './server';

const PORT = 7899;
const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const GUEST_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const SECRET = process.env.MEET_REALTIME_TOKEN_SECRET || 'integration-secret';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  process.stdout.write(
    `${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}\n`
  );
  if (!ok) failures += 1;
}

function mintToken(
  role: MeetRealtimeRole,
  userId: string,
  admission: 'open' | 'lobby',
  displayName: string
) {
  return signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      admission,
      displayName,
      exp: Math.floor(Date.now() / 1000) + 600,
      limits: {},
      meetingId: MEETING_ID,
      mode: 'call',
      role,
      roomId: `${WS_ID}:${MEETING_ID}`,
      scopes: getMeetRealtimeScopesForRole(role),
      userId,
      wsId: WS_ID,
    }),
    SECRET
  );
}

class TestClient {
  readonly received: MeetRealtimeServerMessage[] = [];
  private socket!: WebSocket;

  async connect(token: string) {
    this.socket = new WebSocket(
      `ws://127.0.0.1:${PORT}/realtime?token=${encodeURIComponent(token)}`
    );
    this.socket.addEventListener('message', (event) => {
      this.received.push(JSON.parse(String(event.data)));
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve());
      this.socket.addEventListener('error', () =>
        reject(new Error('ws_error'))
      );
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  close() {
    this.socket.close();
  }

  /** Waits for the first message of `type`, or resolves null on timeout. */
  waitFor<T extends MeetRealtimeServerMessage['type']>(
    type: T,
    predicate: (message: MeetRealtimeServerMessage) => boolean = () => true,
    timeoutMs = 8000
  ): Promise<Extract<MeetRealtimeServerMessage, { type: T }> | null> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const poll = () => {
        const found = this.received.find(
          (message) => message.type === type && predicate(message)
        );
        if (found) {
          resolve(found as Extract<MeetRealtimeServerMessage, { type: T }>);
          return;
        }
        if (Date.now() > deadline) {
          resolve(null);
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
  }
}

const server = createMeetRealtimeServer({ port: PORT });
process.stdout.write(`room server listening on ${PORT}\n\n`);

const host = new TestClient();
const guest = new TestClient();

try {
  await host.connect(mintToken('host', HOST_ID, 'open', 'Host'));
  const hostReady = await host.waitFor('ready');
  check('host joins and is admitted', hostReady?.admission === 'admitted');
  check('host is issued the host role', hostReady?.role === 'host');

  // --- lobby -------------------------------------------------------------
  await guest.connect(mintToken('speaker', GUEST_ID, 'lobby', 'Guest'));
  const guestReady = await guest.waitFor('ready');
  check(
    'lobby guest is held in the waiting room',
    guestReady?.admission === 'waiting'
  );

  const pending = await host.waitFor(
    'admission.pending',
    (m) => m.type === 'admission.pending' && m.participants.length > 0
  );
  check(
    'host is notified of the waiting guest',
    pending?.participants[0]?.displayName === 'Guest'
  );

  guest.send({ body: 'let me in', type: 'chat.message' });
  const blocked = await guest.waitFor('error', undefined, 2000);
  check('waiting guest cannot chat', blocked?.error === 'awaiting_admission');

  host.send({ admit: true, type: 'admission.decide', userId: GUEST_ID });
  const admitted = await guest.waitFor('admission.result');
  check('host admits the guest', admitted?.admitted === true);

  const presence = await host.waitFor(
    'presence',
    (m) => m.type === 'presence' && m.presence.length === 2
  );
  check(
    'both participants appear in presence',
    presence?.presence.length === 2
  );

  // --- chat and hand raise ----------------------------------------------
  guest.send({ body: 'hello room', type: 'chat.message' });
  const chat = await host.waitFor('chat.message');
  check('chat reaches the other participant', chat?.body === 'hello room');
  check('chat carries the sender display name', chat?.displayName === 'Guest');

  guest.send({ raised: true, type: 'hand.raise' });
  const stage = await host.waitFor(
    'stage',
    (m) => m.type === 'stage' && m.stage.raisedHandUserIds.includes(GUEST_ID)
  );
  check('guest can raise their own hand', Boolean(stage));

  // --- Cloudflare SFU ----------------------------------------------------
  host.send({ requestId: 'sfu-1', type: 'sfu.session.create' });
  const sfu = await host.waitFor(
    'sfu.response',
    (m) => m.type === 'sfu.response' && m.requestId === 'sfu-1',
    12_000
  );
  const sessionId = (sfu?.result as { sessionId?: string } | undefined)
    ?.sessionId;
  check(
    'room server creates a real Cloudflare SFU session',
    Boolean(sessionId),
    sessionId ? `session ${sessionId.slice(0, 8)}…` : 'no sessionId returned'
  );

  // --- host controls -----------------------------------------------------
  host.send({ kinds: ['audio'], type: 'participant.mute', userId: GUEST_ID });
  const muted = await host.waitFor('participant.muted');
  check('host can force-mute a participant', muted?.userId === GUEST_ID);

  guest.send({ kinds: ['audio'], type: 'participant.mute', userId: HOST_ID });
  const refused = await guest.waitFor(
    'error',
    (m) => m.type === 'error' && m.error === 'permission_denied',
    2000
  );
  check('a speaker cannot mute the host', Boolean(refused));

  host.send({ type: 'participant.remove', userId: GUEST_ID });
  const removed = await host.waitFor('participant.removed');
  check('host can remove a participant', removed?.userId === GUEST_ID);
} catch (error) {
  check('integration run completed', false, String(error));
} finally {
  host.close();
  guest.close();
  server.stop(true);
}

process.stdout.write(
  `\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`
);
process.exit(failures === 0 ? 0 : 1);
