/**
 * Typed client for the fleet bridge routes of the Mastermind store Worker.
 * One attempt per call, no retries and no redirects: a reply is retried by
 * its sender with the same id, which the bridge answers with the first
 * receipt. Failures throw `MastermindBridgeError` with a closed code.
 */
import {
  BRIDGE_LIMITS,
  BRIDGE_PROTOCOL_VERSION,
  OWNER_TICKET_VERSION,
  type BridgeErrorCode,
  type BridgeLive,
  type BridgeReceipt,
  type BridgeReplyEnvelope,
  type BridgeRpcRequest,
  bridgeRpcResponseSchema,
  bridgeLiveResponseSchema,
  bridgeReceiptResponseSchema,
  bridgeSendResponseSchema,
  bridgeTicketResponseSchema,
} from './bridge-protocol';

export class MastermindBridgeError extends Error {
  constructor(
    readonly code: BridgeErrorCode | 'timeout' | 'network' | 'invalid_response',
    options?: ErrorOptions
  ) {
    super(`Mastermind bridge unavailable: ${code}`, options);
    this.name = 'MastermindBridgeError';
  }
}

export interface MastermindBridge {
  /** Where a ticket holder opens its WebSocket. */
  readonly socketUrl: string;
  ticket(
    request:
      | { role: 'machine'; machineId: string }
      | { role: 'owner'; ownerId: string; leaseExpiresAt: number }
  ): Promise<{ ticket: string; expiresAt: number }>;
  send(input: {
    envelope: BridgeReplyEnvelope;
    sig: string;
    ackKey: string;
    waitMs?: number;
  }): Promise<{ receipt: BridgeReceipt; replayed: boolean }>;
  /** Relays a sealed read request; resolves to the machine's sealed answer. */
  rpc(input: {
    request: BridgeRpcRequest;
    sig: string;
    waitMs?: number;
  }): Promise<{ iv: string; data: string }>;
  receipt(id: string): Promise<BridgeReceipt | null>;
  live(): Promise<BridgeLive>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function createMastermindBridgeClient(options: {
  url: string;
  token: string;
  fetch?: Fetch;
  timeoutMs?: number;
}): MastermindBridge {
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 4000;
  const socketUrl = new URL('/v1/bridge/connect', options.url);
  socketUrl.protocol = socketUrl.protocol === 'http:' ? 'ws:' : 'wss:';

  async function call(path: string, body?: unknown, extraMs = 0) {
    let response: Response;
    try {
      response = await doFetch(new URL(path, options.url).toString(), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${options.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs + extraMs),
      });
    } catch (error) {
      throw new MastermindBridgeError(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : 'network',
        { cause: error }
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new MastermindBridgeError('invalid_response');
    }
  }

  type Failure = { ok: false; error: BridgeErrorCode };
  function unwrap<T extends { ok: boolean }>(
    parsed: { success: true; data: T } | { success: false }
  ): Exclude<T, Failure> {
    if (!parsed.success) throw new MastermindBridgeError('invalid_response');
    if (!parsed.data.ok)
      throw new MastermindBridgeError(
        (parsed.data as unknown as Failure).error
      );
    return parsed.data as Exclude<T, Failure>;
  }

  return {
    socketUrl: socketUrl.toString(),
    async ticket(request) {
      const { ticket, expiresAt } = unwrap(
        bridgeTicketResponseSchema.safeParse(
          await call('/v1/bridge/ticket', {
            v:
              request.role === 'owner'
                ? OWNER_TICKET_VERSION
                : BRIDGE_PROTOCOL_VERSION,
            ...request,
          })
        )
      );
      return { ticket, expiresAt };
    },
    async send(input) {
      const waitMs = Math.min(input.waitMs ?? 0, BRIDGE_LIMITS.maxWaitMs);
      const { receipt, replayed } = unwrap(
        bridgeSendResponseSchema.safeParse(
          await call(
            '/v1/bridge/send',
            { v: BRIDGE_PROTOCOL_VERSION, ...input, waitMs },
            waitMs
          )
        )
      );
      return { receipt, replayed };
    },
    async rpc(input) {
      const waitMs = Math.min(
        input.waitMs ?? BRIDGE_LIMITS.maxRpcWaitMs,
        BRIDGE_LIMITS.maxRpcWaitMs
      );
      return unwrap(
        bridgeRpcResponseSchema.safeParse(
          await call(
            '/v1/bridge/rpc',
            { v: BRIDGE_PROTOCOL_VERSION, ...input, waitMs },
            waitMs
          )
        )
      ).box;
    },
    async receipt(id) {
      return unwrap(
        bridgeReceiptResponseSchema.safeParse(
          await call(`/v1/bridge/receipt?id=${encodeURIComponent(id)}`)
        )
      ).receipt;
    },
    async live() {
      return unwrap(
        bridgeLiveResponseSchema.safeParse(await call('/v1/bridge/live'))
      ).live;
    },
  };
}

/**
 * The configured bridge, or null when the store Worker is not configured.
 * It lives in the same Worker as the store, behind the same service token.
 */
export function configuredMastermindBridge(
  env: Record<string, string | undefined> = process.env
): MastermindBridge | null {
  const url = env.MASTERMIND_STORE_URL?.trim();
  const token = env.MASTERMIND_STORE_TOKEN?.trim();
  if (!url || !token || token.length < 32) return null;
  try {
    const parsed = new URL(url);
    const loopback =
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
    if (parsed.protocol !== 'https:' && !loopback) return null;
  } catch {
    return null;
  }
  return createMastermindBridgeClient({ url, token });
}
