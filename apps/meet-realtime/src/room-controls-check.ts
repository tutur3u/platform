/** Synthetic room-policy check for local Workers or the production realtime Worker.
 * No employee meeting, files, or AI calls are used. Set MEET_CHECK_REALTIME_URL
 * and MEET_REALTIME_TOKEN_SECRET; tokens and response bodies are never logged.
 */
import assert from 'node:assert/strict';
import {
  getMeetRealtimeScopesForRole,
  type MeetRealtimeRole,
  type MeetRealtimeServerMessage,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { signMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import { validateMeetCheckEndpoint } from './check-endpoint';

const endpoint = validateMeetCheckEndpoint(
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: finite standalone verification harness.
  process.env.MEET_CHECK_REALTIME_URL || 'ws://127.0.0.1:8799/realtime'
);
const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
if (!secret) throw new Error('MEET_REALTIME_TOKEN_SECRET is required');
const meetingId = crypto.randomUUID(),
  wsId = crypto.randomUUID();
const ownerAccount = crypto.randomUUID(),
  guestAccount = crypto.randomUUID();
const hostDevice = crypto.randomUUID(),
  otherDevice = crypto.randomUUID(),
  guestDevice = crypto.randomUUID();
function token(
  userId: string,
  accountId: string,
  role: MeetRealtimeRole,
  service = false
) {
  return signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      userId,
      accountId,
      role,
      admission: role === 'host' ? 'open' : 'lobby',
      displayName: 'Synthetic verification',
      mode: 'call',
      limits: {},
      scopes: [
        ...getMeetRealtimeScopesForRole(role),
        ...(service ? ['meet:server'] : []),
      ],
      meetingId,
      wsId,
      roomId: `${wsId}:${meetingId}`,
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
    secret!
  );
}
class Client {
  messages: MeetRealtimeServerMessage[] = [];
  socket?: WebSocket;
  async connect(jwt: string) {
    this.socket = new WebSocket(`${endpoint}?token=${encodeURIComponent(jwt)}`);
    this.socket.addEventListener('message', (event) =>
      this.messages.push(JSON.parse(String(event.data)))
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Connection timed out')),
        10000
      );
      this.socket!.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      this.socket!.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('Connection failed'));
        },
        { once: true }
      );
    });
  }
  send(message: object) {
    this.socket!.send(JSON.stringify(message));
  }
  async wait(predicate: (message: MeetRealtimeServerMessage) => boolean) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const found = this.messages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Expected room event did not arrive');
  }
  async command(message: object) {
    const requestId = crypto.randomUUID();
    this.send({ ...message, requestId });
    return this.wait(
      (event) => 'requestId' in event && event.requestId === requestId
    );
  }
}
const host = new Client(),
  other = new Client(),
  guest = new Client();
async function http(path: string, jwt: string, body: unknown) {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = path;
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
const pass = (message: string) => process.stdout.write(`PASS: ${message}\n`);
try {
  await host.connect(token(hostDevice, ownerAccount, 'host'));
  await other.connect(token(otherDevice, ownerAccount, 'host'));
  await guest.connect(token(guestDevice, guestAccount, 'speaker'));
  await host.wait(
    (event) =>
      event.type === 'admission.pending' &&
      event.participants.some((p) => p.userId === guestDevice)
  );
  const sent = await host.command({
    type: 'chat.message',
    body: 'Synthetic room check',
  });
  assert.equal(sent.type, 'chat.message');
  await other.wait((event) => event.type === 'chat.message');
  assert.equal(
    guest.messages.filter((event) => event.type === 'chat.message').length,
    0
  );
  pass('waiting device cannot read room chat');
  host.send({ type: 'admission.decide', userId: guestDevice, admit: true });
  await guest.wait((event) => event.type === 'chat.message');
  assert.equal(
    host.messages.filter((event) => event.type === 'chat.message').length,
    1
  );
  pass('admission delivers history and the sender receives one message');

  const recordingSessionId = crypto.randomUUID();
  assert.equal(
    (
      await guest.command({
        type: 'recording.state',
        state: 'starting',
        recordingSessionId,
      })
    ).type,
    'error'
  );
  assert.equal(
    (
      await host.command({
        type: 'recording.state',
        state: 'starting',
        recordingSessionId,
      })
    ).type,
    'recording.state'
  );
  assert.equal(
    (
      await other.command({
        type: 'recording.state',
        state: 'starting',
        recordingSessionId: crypto.randomUUID(),
      })
    ).type,
    'error'
  );
  assert.equal(
    (
      await host.command({
        type: 'recording.state',
        state: 'recording',
        recordingSessionId,
      })
    ).type,
    'recording.state'
  );
  assert.equal(
    (
      await other.command({
        type: 'recording.state',
        state: 'stopping',
        recordingSessionId: crypto.randomUUID(),
      })
    ).type,
    'error'
  );
  assert.equal(
    (
      await other.command({
        type: 'recording.state',
        state: 'stopping',
        recordingSessionId,
      })
    ).type,
    'recording.state'
  );
  assert.equal(
    (
      await host.command({
        type: 'recording.state',
        state: 'idle',
        recordingSessionId,
      })
    ).type,
    'recording.state'
  );
  pass('recording is admin-only, exclusive, and rejects stale stop commands');

  assert.equal(
    (
      await http('/room-service', token(hostDevice, ownerAccount, 'host'), {
        action: 'costs',
      })
    ).status,
    403
  );
  assert.equal(
    (
      await http(
        '/room-service',
        token(guestDevice, guestAccount, 'speaker', true),
        { action: 'costs' }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await http(
        '/room-service',
        token(guestDevice, guestAccount, 'speaker', true),
        { action: 'recording.list' }
      )
    ).status,
    403
  );
  const costs = await http(
    '/room-service',
    token(hostDevice, ownerAccount, 'host', true),
    { action: 'costs' }
  );
  assert.equal(costs.status, 200);
  assert.equal((await costs.json()).cloudflare.complete, false);
  pass('server-only services enforce admin cost and private recording access');

  const devices = await http(
    '/room-device',
    token(otherDevice, ownerAccount, 'host'),
    { mode: 'switch' }
  );
  assert.equal(devices.status, 200);
  assert.equal((await devices.json()).otherDeviceCount, 1);
  await host.wait(
    (event) =>
      event.type === 'participant.removed' && event.userId === hostDevice
  );
  pass('switching devices removes only the account’s previous device');
  other.send({ type: 'participant.remove', userId: guestDevice });
  await guest.wait(
    (event) =>
      event.type === 'participant.removed' && event.userId === guestDevice
  );
  pass('removed participants receive a terminal removal event');
  other.send({ type: 'room.end' });
  await other.wait((event) => event.type === 'room.ended');
  pass('ending the synthetic room disconnects its participants');
} finally {
  host.socket?.close();
  other.socket?.close();
  guest.socket?.close();
}
