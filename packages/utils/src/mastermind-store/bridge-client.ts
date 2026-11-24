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
  bridgeErrorCodes,
  bridgeLiveResponseSchema,
  bridgeReceiptResponseSchema,
  bridgeSendResponseSchema,
  bridgeTicketResponseSchema,
} from './bridge-protocol';
import {
  ATTACHMENT_FINALIZE_HEADER,
  type AttachmentFinalize,
  type AttachmentRecord,
  type AttachmentReserve,
  attachmentFinalizeResponseSchema,
  attachmentRecordsResponseSchema,
  attachmentReserveResponseSchema,
  BRIDGE_REPLY_V2_VERSION,
  type BridgeSendV2Request,
} from './reply-attachments';

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
  /** Mints one upload record; its quotas are held from now on. */
  reserveAttachment(
    input: Omit<AttachmentReserve, 'v'>
  ): Promise<{ id: string; expiresAt: number }>;
  /** Finalizes a reserved record once with the derived bytes. */
  finalizeAttachment(
    id: string,
    input: AttachmentFinalize,
    bytes: Uint8Array
  ): Promise<AttachmentRecord>;
  attachmentRecords(ids: string[]): Promise<(AttachmentRecord | null)[]>;
  /** Stores and pushes a reply with attachments (envelope v2). */
  sendV2(
    input: Omit<BridgeSendV2Request, 'v'>
  ): Promise<{ receipt: BridgeReceipt; replayed: boolean }>;
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

  async function call(
    path: string,
    body?: unknown,
    extraMs = 0,
    raw?: { bytes: Uint8Array; headers: Record<string, string> }
  ) {
    let response: Response;
    try {
      response = await doFetch(new URL(path, options.url).toString(), {
        method: raw ? 'PUT' : body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${options.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(raw
            ? { 'content-type': 'application/octet-stream', ...raw.headers }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(raw ? { body: raw.bytes as BodyInit } : {}),
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

  /** Attachment answers carry the store's closed code as a plain string. */
  function unwrapAttachment<T extends { ok: boolean }>(
    parsed: { success: true; data: T } | { success: false }
  ): Exclude<T, { ok: false }> {
    if (!parsed.success) throw new MastermindBridgeError('invalid_response');
    if (!parsed.data.ok) {
      const error = (parsed.data as unknown as { error: string }).error;
      throw new MastermindBridgeError(
        (bridgeErrorCodes as readonly string[]).includes(error)
          ? (error as BridgeErrorCode)
          : 'invalid_response'
      );
    }
    return parsed.data as Exclude<T, { ok: false }>;
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
    async reserveAttachment(input) {
      const { id, expiresAt } = unwrapAttachment(
        attachmentReserveResponseSchema.safeParse(
          await call('/v1/bridge/attachments/reserve', { v: 1, ...input })
        )
      );
      return { id, expiresAt };
    },
    async finalizeAttachment(id, input, bytes) {
      return unwrapAttachment(
        attachmentFinalizeResponseSchema.safeParse(
          await call(
            `/v1/bridge/attachments/object?id=${encodeURIComponent(id)}`,
            undefined,
            8000,
            {
              bytes,
              headers: { [ATTACHMENT_FINALIZE_HEADER]: JSON.stringify(input) },
            }
          )
        )
      ).record;
    },
    async attachmentRecords(ids) {
      return unwrapAttachment(
        attachmentRecordsResponseSchema.safeParse(
          await call('/v1/bridge/attachments/records', { v: 1, ids })
        )
      ).records;
    },
    async sendV2(input) {
      const waitMs = Math.min(input.waitMs ?? 0, BRIDGE_LIMITS.maxWaitMs);
      const { receipt, replayed } = unwrap(
        bridgeSendResponseSchema.safeParse(
          await call(
            '/v1/bridge/send2',
            { ...input, v: BRIDGE_REPLY_V2_VERSION, waitMs },
            waitMs
          )
        )
      );
      return { receipt, replayed };
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
