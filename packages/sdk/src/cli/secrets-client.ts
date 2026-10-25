import { randomUUID } from 'node:crypto';
import {
  SECRETS_OPERATION_PATH,
  type SecretsCredentials,
} from './secrets-credentials';
import { MAX_SECRET_BYTES, wipe } from './secrets-files';

export const MAX_BASE64_LENGTH = Math.ceil(MAX_SECRET_BYTES / 3) * 4;
// base64 payload plus the JSON envelope around it.
export const MAX_RESPONSE_BYTES = MAX_BASE64_LENGTH + 64 * 1024;
export const MAX_LIST_ITEMS = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._:/@+-]{0,127}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const CODE = /^[a-z][a-z0-9_.-]{0,63}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** A server answer that means the original request may still be running. */
const AMBIGUOUS_CODES = new Set(['request_in_progress']);

export type UnknownCause =
  | 'network'
  | 'timeout'
  | 'status'
  | 'redirect'
  | 'oversize'
  | 'malformed';

export type Outcome<T> =
  | { kind: 'ok'; value: T }
  /** Definitive refusal: HTTP 4xx with a well-formed `{ok:false,code}`. */
  | { kind: 'rejected'; code: string; retryAfterSeconds?: number }
  /** Nothing proves whether the server acted. Never replay on this. */
  | { kind: 'unknown'; cause: UnknownCause };

export function isValidName(name: string) {
  return NAME.test(name);
}

export interface SecretListItem {
  id: string;
  name: string;
}

export interface SecretsClientOptions {
  credentials: SecretsCredentials;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function revisionOf(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  return typeof value === 'string' && IDENTIFIER.test(value)
    ? value
    : undefined;
}

export function decodeBase64(text: string) {
  if (
    text.length === 0 ||
    text.length > MAX_BASE64_LENGTH ||
    text.length % 4 !== 0 ||
    !BASE64.test(text)
  )
    return undefined;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const decoded = Buffer.from(text, 'base64');
  if (
    decoded.length !== (text.length / 4) * 3 - padding ||
    decoded.length > MAX_SECRET_BYTES
  ) {
    wipe(decoded);
    return undefined;
  }
  return decoded;
}

export class SecretsClient {
  readonly #credentials: SecretsCredentials;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #timeoutMs: number;

  constructor(options: SecretsClientOptions) {
    this.#credentials = options.credentials;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async list(): Promise<
    Outcome<{ items: SecretListItem[]; revision: string }>
  > {
    const result = await this.#call('list', randomUUID(), {});
    if (result.kind !== 'ok') return result;
    const value = record(result.value);
    const revision = revisionOf(value?.revision);
    if (!value || !Array.isArray(value.items) || revision === undefined)
      return malformed();
    if (value.items.length > MAX_LIST_ITEMS) return malformed();
    const items: SecretListItem[] = [];
    for (const raw of value.items) {
      const item = record(raw);
      if (
        !item ||
        typeof item.id !== 'string' ||
        !IDENTIFIER.test(item.id) ||
        typeof item.name !== 'string' ||
        !NAME.test(item.name)
      )
        return malformed();
      items.push({ id: item.id, name: item.name });
    }
    return { kind: 'ok', value: { items, revision } };
  }

  /** The caller owns and must wipe the returned bytes. */
  async get(name: string): Promise<Outcome<{ name: string; bytes: Buffer }>> {
    const result = await this.#call('get', randomUUID(), { name });
    if (result.kind !== 'ok') return result;
    const value = record(result.value);
    if (!value || value.name !== name || typeof value.bytesBase64 !== 'string')
      return malformed();
    const bytes = decodeBase64(value.bytesBase64);
    return bytes ? { kind: 'ok', value: { name, bytes } } : malformed();
  }

  async put(
    name: string,
    bytes: Uint8Array,
    requestId: string
  ): Promise<Outcome<{ itemId: string; revision: string }>> {
    const result = await this.#call('put', requestId, {
      name,
      bytesBase64: Buffer.from(bytes).toString('base64'),
    });
    if (result.kind !== 'ok') return result;
    const value = record(result.value);
    const revision = revisionOf(value?.revision);
    if (
      !value ||
      value.requestId !== requestId ||
      typeof value.itemId !== 'string' ||
      !IDENTIFIER.test(value.itemId) ||
      revision === undefined
    )
      return malformed();
    return { kind: 'ok', value: { itemId: value.itemId, revision } };
  }

  async rotate(requestId: string): Promise<Outcome<{ revision: string }>> {
    const result = await this.#call('rotate', requestId, {});
    if (result.kind !== 'ok') return result;
    const value = record(result.value);
    const revision = revisionOf(value?.revision);
    if (!value || value.requestId !== requestId || revision === undefined)
      return malformed();
    return { kind: 'ok', value: { revision } };
  }

  async status(targetRequestId: string): Promise<
    Outcome<{
      found: boolean;
      action?: string;
      itemId?: string;
      revision?: string;
    }>
  > {
    const result = await this.#call('request.status', randomUUID(), {
      targetRequestId,
    });
    if (result.kind !== 'ok') return result;
    const value = record(result.value);
    if (!value || typeof value.found !== 'boolean') return malformed();
    if (!value.found) return { kind: 'ok', value: { found: false } };
    const receipt = record(value.receipt);
    const itemId = receipt?.itemId;
    const revision = revisionOf(receipt?.revision);
    return {
      kind: 'ok',
      value: {
        found: true,
        action: typeof value.action === 'string' ? value.action : undefined,
        itemId:
          typeof itemId === 'string' && IDENTIFIER.test(itemId)
            ? itemId
            : undefined,
        revision,
      },
    };
  }

  async #call(
    action: string,
    requestId: string,
    body: Record<string, unknown>
  ): Promise<Outcome<unknown>> {
    const { endpoint, workspaceId, vaultId, token, expiresAt } =
      this.#credentials;
    if (Date.parse(expiresAt) <= this.#now())
      return { kind: 'rejected', code: 'credentials_expired' };
    const url = `${endpoint}${SECRETS_OPERATION_PATH}`;
    let encoded: Buffer | undefined;
    let payload: Uint8Array<ArrayBuffer> | undefined;
    let chunks: Buffer[] = [];
    try {
      encoded = Buffer.from(
        JSON.stringify({ workspaceId, vaultId, requestId, action, ...body })
      );
      payload = Uint8Array.from(encoded);
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: payload,
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof Error && error.name === 'TimeoutError';
        return { kind: 'unknown', cause: timedOut ? 'timeout' : 'network' };
      }
      if (
        response.redirected ||
        (response.status >= 300 && response.status < 400) ||
        (response.url && response.url !== url)
      )
        return { kind: 'unknown', cause: 'redirect' };
      const read = await readBounded(response);
      chunks = read.chunks;
      if (read.oversize) return { kind: 'unknown', cause: 'oversize' };
      return classify(response, read.chunks);
    } catch {
      return { kind: 'unknown', cause: 'network' };
    } finally {
      wipe(encoded, payload, ...chunks);
    }
  }
}

function malformed(): Outcome<never> {
  return { kind: 'unknown', cause: 'malformed' };
}

async function readBounded(response: Response) {
  const chunks: Buffer[] = [];
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return { chunks, oversize: true };
  }
  if (!response.body) return { chunks, oversize: false };
  const reader = response.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { chunks, oversize: false };
    total += value.byteLength;
    chunks.push(Buffer.from(value));
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { chunks, oversize: true };
    }
  }
}

function classify(response: Response, chunks: Buffer[]): Outcome<unknown> {
  if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? ''))
    return malformed();
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return malformed();
  }
  const body = record(parsed);
  if (body?.ok === true && response.status >= 200 && response.status < 300)
    return 'value' in body ? { kind: 'ok', value: body.value } : malformed();
  if (body?.ok === false && response.status >= 400 && response.status < 500) {
    const code =
      typeof body.code === 'string' && CODE.test(body.code)
        ? body.code
        : 'unrecognized_error';
    if (AMBIGUOUS_CODES.has(code)) return { kind: 'unknown', cause: 'status' };
    const retry = body.retryAfterSeconds;
    return {
      kind: 'rejected',
      code,
      retryAfterSeconds:
        typeof retry === 'number' &&
        Number.isInteger(retry) &&
        retry >= 0 &&
        retry <= 86_400
          ? retry
          : undefined,
    };
  }
  return {
    kind: 'unknown',
    cause: response.status >= 500 ? 'status' : 'malformed',
  };
}
