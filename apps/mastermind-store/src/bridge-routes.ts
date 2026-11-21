/**
 * Fleet bridge routes of the Mastermind store Worker.
 *
 * - `POST /v1/bridge/ticket` (service token): a single-use connect ticket.
 * - `GET  /v1/bridge/connect` (ticket as the second WebSocket subprotocol):
 *   the machine or owner socket.
 * - `POST /v1/bridge/send` (service token): store and push one thread reply.
 * - `GET  /v1/bridge/receipt?id=` (service token): a reply's receipt.
 * - `GET  /v1/bridge/live` (service token): machine presence and pokes.
 *
 * Only Web holds the service token; machines and owners reach the socket
 * with a ticket Web minted for them after its own checks.
 */
import {
  BRIDGE_LIMITS,
  type BridgeErrorCode,
  bridgeSendRequestSchema,
  bridgeTicketRequestSchema,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { bridgeBudget } from './bridge';
import { json, readCapped, tokenMatches } from './http';
import type { StoreEnv } from './worker';

const STATUS: Record<BridgeErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  stopped: 503,
  budget: 429,
  full: 507,
  rate_limited: 429,
  conflict: 409,
  unavailable: 503,
};
const REPLY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MAX_BODY = 2 * BRIDGE_LIMITS.maxFrameBytes;

const fail = (error: BridgeErrorCode) =>
  json({ ok: false, error }, STATUS[error]);

const stub = (env: StoreEnv) =>
  env.MASTERMIND_BRIDGE.get(env.MASTERMIND_BRIDGE.idFromName('v1'));

async function parseBody(request: Request) {
  const body = await readCapped(request, MAX_BODY);
  if (body === null) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

export async function handleBridge(
  request: Request,
  env: StoreEnv,
  path: string
): Promise<{ response: Response; kind: string }> {
  if (path === '/v1/bridge/connect' && request.method === 'GET')
    // The Durable Object checks the ticket; nothing else admits a socket.
    return { response: await stub(env).fetch(request), kind: 'bridge:connect' };

  const auth = await tokenMatches(
    request.headers.get('authorization'),
    env.MASTERMIND_STORE_TOKENS
  );
  if (auth === 'unconfigured')
    return { response: fail('unavailable'), kind: 'bridge:unconfigured' };
  if (auth === 'denied')
    return { response: fail('unauthorized'), kind: 'bridge:denied' };
  const budget = bridgeBudget(env.MASTERMIND_BRIDGE_DAILY_OPS);
  if (budget === null)
    return { response: fail('unavailable'), kind: 'bridge:config' };

  if (path === '/v1/bridge/ticket' && request.method === 'POST') {
    const parsed = bridgeTicketRequestSchema.safeParse(
      await parseBody(request)
    );
    if (!parsed.success)
      return { response: fail('bad_request'), kind: 'bridge:ticket:schema' };
    const minted = await stub(env).mintTicket(parsed.data, budget);
    return minted.ok
      ? { response: json(minted), kind: `bridge:ticket:${parsed.data.role}` }
      : { response: fail(minted.error), kind: `bridge:ticket:${minted.error}` };
  }

  if (path === '/v1/bridge/send' && request.method === 'POST') {
    const parsed = bridgeSendRequestSchema.safeParse(await parseBody(request));
    if (!parsed.success)
      return { response: fail('bad_request'), kind: 'bridge:send:schema' };
    const sent = await stub(env).send(parsed.data, budget);
    return sent.ok
      ? { response: json(sent), kind: `bridge:send:${sent.receipt.state}` }
      : { response: fail(sent.error), kind: `bridge:send:${sent.error}` };
  }

  if (path === '/v1/bridge/receipt' && request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!REPLY_ID.test(id))
      return { response: fail('bad_request'), kind: 'bridge:receipt:schema' };
    return {
      response: json({ ok: true, receipt: await stub(env).receipt(id) }),
      kind: 'bridge:receipt',
    };
  }

  if (path === '/v1/bridge/live' && request.method === 'GET')
    return {
      response: json({ ok: true, live: await stub(env).live() }),
      kind: 'bridge:live',
    };

  return {
    response: json({ ok: false, error: 'bad_request' }, 404),
    kind: 'bridge:other',
  };
}
