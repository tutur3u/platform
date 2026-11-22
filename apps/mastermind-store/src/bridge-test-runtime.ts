import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUBPROTOCOL,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { Miniflare } from 'miniflare';

export const ORIGIN = 'http://localhost';
export const ACTOR = '00000000-0000-4000-8000-0000000000aa';
export const ownerTicket = () => ({
  role: 'owner' as const,
  ownerId: ACTOR,
  leaseExpiresAt: Date.now() + 300_000,
});
export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const TOKEN = 'service-token-'.padEnd(48, 's');
export const OPERATOR = 'operator-token-'.padEnd(48, 'o');

export function createBridgeTestRuntime(
  scriptPath: string,
  modulesRoot: string,
  ops: string,
  authorize: (ownerId: string) => number = () => 204
) {
  return new Miniflare({
    durableObjectsPersist: false,
    modules: true,
    scriptPath,
    modulesRoot,
    compatibilityDate: '2026-07-01',
    outboundService: async (request) => {
      const expected =
        'https://tuturuuu.com/api/v1/mastermind/fleet/live/owner-authorization';
      if (
        request.url !== expected ||
        request.headers.get('authorization') !== `Bearer ${TOKEN}`
      )
        return new Response(null, { status: 401 });
      const { ownerId } = (await request.json()) as { ownerId: string };
      return new Response(null, { status: authorize(ownerId) });
    },
    durableObjects: {
      MASTERMIND_STORE: { className: 'MastermindStore', useSQLite: true },
      MASTERMIND_BRIDGE: { className: 'FleetBridge', useSQLite: true },
    },
    bindings: {
      MASTERMIND_STORE_TOKENS: TOKEN,
      MASTERMIND_STORE_OPERATOR_TOKEN: OPERATOR,
      MASTERMIND_BRIDGE_DAILY_OPS: ops,
    },
  });
}

/** The upgrade status alone, for the refusal cases. */
export async function upgradeStatus(
  mf: Miniflare,
  ticket: string,
  protocol?: string
) {
  const response = await mf.dispatchFetch(`${ORIGIN}/v1/bridge/connect`, {
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': protocol ?? `${BRIDGE_SUBPROTOCOL}, ${ticket}`,
    },
  });
  return response.status;
}

export async function openBridgeSocket(
  mf: Miniflare,
  ticket: string,
  ackSig: (frame: never) => string
) {
  const response = await mf.dispatchFetch(`${ORIGIN}/v1/bridge/connect`, {
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': `${BRIDGE_SUBPROTOCOL}, ${ticket}`,
    },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`connect refused: ${response.status}`);
  const frames: Record<string, any>[] = [];
  const waiting: ((frame: Record<string, any>) => void)[] = [];
  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(String(event.data));
    const next = waiting.shift();
    if (next) next(frame);
    else frames.push(frame);
  });
  socket.accept();
  return {
    status: response.status,
    socket,
    /** Acknowledgements are signed as the machine unless a signature is given. */
    send: (frame: Record<string, unknown>) =>
      socket.send(
        JSON.stringify({
          v: BRIDGE_PROTOCOL_VERSION,
          ...(frame.t === 'ack' ? { sig: ackSig(frame as never) } : {}),
          ...frame,
        })
      ),
    /** The next frame, or a timeout marker so a missing frame fails fast. */
    next: () =>
      frames.length > 0
        ? Promise.resolve(frames.shift()!)
        : new Promise<Record<string, any>>((done) => {
            const timer = setTimeout(() => done({ t: 'timeout' }), 1500);
            waiting.push((frame) => {
              clearTimeout(timer);
              done(frame);
            });
          }),
    pending: () => frames.length,
  };
}
