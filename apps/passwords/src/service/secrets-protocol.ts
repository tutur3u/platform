import {
  PasswordsError,
  record,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';

export const SECRETS_ORIGIN = 'https://passwords.tuturuuu.com';
export const OPERATION_PATH = '/api/v1/secrets/operation';
export const EXCHANGE_PATH = '/api/v1/secrets/oidc/exchange';
export const CREDENTIALS_PATH = '/api/v1/secrets/credentials';
export const AGENT_CREDENTIALS_PATH = '/api/v1/secrets/agent-credentials';
export const MAX_BODY = Math.ceil((5 * 1024 * 1024) / 3) * 4 + 1024;
export const MAX_REQUEST_MS = 25_000;
export type Scope = { wsId: string; vaultId: string };
export type Credentials = {
  version: 1;
  endpoint: string;
  workspaceId: string;
  vaultId: string;
  token: string;
  expiresAt: string;
};

export function credentials(
  scope: Scope,
  token: string,
  expiresAt: number
): Credentials {
  return {
    version: 1,
    endpoint: SECRETS_ORIGIN,
    workspaceId: uuid(scope.wsId),
    vaultId: uuid(scope.vaultId),
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function json(value: unknown, status = 200, download = false) {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store, private',
      pragma: 'no-cache',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      ...(download
        ? { 'content-disposition': 'attachment; filename="secrets.json"' }
        : {}),
    },
  });
}

export function failure(error: unknown, uncertain = false) {
  const code = uncertain
    ? 'OPERATION_UNCERTAIN'
    : error instanceof PasswordsError
      ? error.code
      : 'UNAVAILABLE';
  const status = {
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    STEP_UP_REQUIRED: 403,
    NOT_FOUND: 404,
    INVALID_INPUT: 400,
    TOO_LARGE: 413,
    REVISION_CONFLICT: 409,
    RATE_LIMITED: 429,
    STOPPED: 503,
    UNAVAILABLE: 503,
    OPERATION_UNCERTAIN: 503,
  }[code];
  return json({ ok: false, code: code.toLowerCase() }, status);
}

export function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    throw new PasswordsError('INVALID_INPUT');
}

export function bearer(request: Request) {
  const value = request.headers.get('authorization');
  if (!value || !/^Bearer [A-Za-z0-9._~+/=-]{16,16384}$/.test(value))
    throw new PasswordsError('UNAUTHENTICATED');
  return value.slice(7);
}

export async function boundedJson(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal
) {
  if (!body) throw new PasswordsError('INVALID_INPUT');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let bytes: Uint8Array | undefined;
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      void reader.cancel().catch(() => {});
      reject(new PasswordsError('UNAVAILABLE'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), cancelled]);
      if (chunk.done) break;
      chunks.push(chunk.value);
      length += chunk.value.byteLength;
      if (length > limit) throw new PasswordsError('TOO_LARGE');
    }
    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return record(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      );
    } catch {
      throw new PasswordsError('INVALID_INPUT');
    }
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
    bytes?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function post(request: Request, origin: string, browser = false) {
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    url.origin !== origin ||
    url.search ||
    url.hash ||
    request.headers.get('content-type')?.split(';')[0]?.trim() !==
      'application/json'
  )
    throw new PasswordsError('INVALID_INPUT');
  const caller = request.headers.get('origin');
  if (browser ? caller !== origin : caller !== null)
    throw new PasswordsError('FORBIDDEN');
}
