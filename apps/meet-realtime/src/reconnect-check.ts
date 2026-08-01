/** Proves the client recovers when the room server goes away mid-call. */
import {
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { signMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import { MeetSignaling } from '../../meet/src/features/call/lib/signaling';
import { createMeetRealtimeServer } from './server';

const PORT = 7897;
const SECRET = process.env.MEET_REALTIME_TOKEN_SECRET || 'integration-secret';
let failures = 0;
const check = (l: string, ok: boolean, d = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}: ${l}${d ? ` — ${d}` : ''}\n`);
  if (!ok) failures++;
};

let tokensMinted = 0;
const mint = () => {
  tokensMinted++;
  return signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      admission: 'open',
      displayName: 'Host',
      exp: Math.floor(Date.now() / 1000) + 600,
      limits: {},
      meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
      mode: 'call',
      role: 'host',
      roomId: 'ws:meeting',
      scopes: getMeetRealtimeScopesForRole('host'),
      userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
      wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    }),
    SECRET
  );
};

const statuses: string[] = [];
let reconnectedCalls = 0;
let server = createMeetRealtimeServer({ port: PORT });

const signaling = new MeetSignaling({
  onMessage: () => undefined,
  onReconnected: () => {
    reconnectedCalls++;
  },
  onStatusChange: (s) => statuses.push(s),
  resolveUrl: () =>
    `ws://127.0.0.1:${PORT}/realtime?token=${encodeURIComponent(mint())}`,
});
signaling.connect();

const until = async (fn: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await Bun.sleep(50);
  }
  return false;
};

check('client connects', await until(() => signaling.isOpen, 5000));
const firstTokens = tokensMinted;

server.stop(true);
check('client notices the drop', await until(() => !signaling.isOpen, 5000));

server = createMeetRealtimeServer({ port: PORT });
check(
  'client reconnects automatically',
  await until(() => signaling.isOpen, 20000)
);
check(
  'onReconnected fired exactly once',
  reconnectedCalls === 1,
  `got ${reconnectedCalls}`
);
check(
  'a fresh token was minted for the retry',
  tokensMinted > firstTokens,
  `${firstTokens} -> ${tokensMinted}`
);
check(
  'status went open -> closed -> open',
  statuses.includes('closed') &&
    statuses.filter((s) => s === 'open').length >= 2,
  statuses.join(',')
);

signaling.close();
await Bun.sleep(300);
const afterClose = signaling.isOpen;
check('an intentional close does not reconnect', !afterClose);

server.stop(true);
process.stdout.write(
  `\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`}\n`
);
process.exit(failures === 0 ? 0 : 1);
