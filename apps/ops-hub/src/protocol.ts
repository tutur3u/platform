export const ASSERTION_HEADER = 'x-ops-hub-user';
export const PUBLISHER_USER_HEADER = 'x-ops-hub-publisher-user';
export const SIGNATURE_HEADER = 'x-ops-hub-signature';
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

export function allowedUsers(value: string | undefined): Set<string> {
  const entries = value?.split(',').map((id) => id.trim().toLowerCase()) ?? [];
  return entries.length > 0 &&
    entries.length <= 10 &&
    entries.every((id) => UUID.test(id))
    ? new Set(entries)
    : new Set();
}

export function routeAllowed(method: string, target: string) {
  const url = new URL(target, 'https://hub.invalid');
  if (method === 'DELETE') return url.pathname === '/hub' && !url.search;
  if (method !== 'GET') return false;
  if (url.pathname === '/hub/export') {
    return (
      [...url.searchParams.keys()].every((key) =>
        ['section', 'after', 'seq'].includes(key)
      ) &&
      ['section', 'after', 'seq'].every(
        (key) => url.searchParams.getAll(key).length <= 1
      ) &&
      [
        'snapshot',
        'events',
        'needs_you',
        'decisions',
        'metrics',
        'observability_snapshot',
      ].includes(url.searchParams.get('section') ?? 'snapshot') &&
      ['after', 'seq'].every((key) =>
        /^(0|[1-9][0-9]{0,14})$/.test(url.searchParams.get(key) ?? '0')
      )
    );
  }
  if (url.pathname === '/decisions') {
    const after = url.searchParams.get('after') ?? '0';
    return (
      [...url.searchParams.keys()].every((key) =>
        ['after', 'category'].includes(key)
      ) &&
      url.searchParams.getAll('after').length <= 1 &&
      url.searchParams.getAll('category').length <= 1 &&
      /^(0|[1-9][0-9]{0,14})(?::[a-zA-Z0-9][a-zA-Z0-9_-]{0,79})?$/.test(
        after
      ) &&
      (!url.searchParams.has('category') ||
        ['auto', 'delegated', 'user'].includes(
          url.searchParams.get('category') ?? ''
        ))
    );
  }
  if (url.pathname === '/observability') {
    return (
      [...url.searchParams.keys()].every((key) =>
        ['since', 'series'].includes(key)
      ) &&
      url.searchParams.getAll('since').length <= 1 &&
      url.searchParams.getAll('series').length <= 1 &&
      /^(0|[1-9][0-9]{0,14})$/.test(url.searchParams.get('since') ?? '0') &&
      [
        'quota_series',
        'speed_series',
        'children_series',
        'staff',
        'ci',
        'cadence',
      ].includes(url.searchParams.get('series') ?? 'quota_series')
    );
  }
  if (url.pathname === '/events') {
    return (
      [...url.searchParams.keys()].every((key) => key === 'after') &&
      url.searchParams.getAll('after').length <= 1 &&
      /^(0|[1-9][0-9]{0,14})$/.test(url.searchParams.get('after') ?? '0')
    );
  }
  return (
    !url.search &&
    [
      '/status',
      '/snapshot',
      '/needs-you',
      '/environments',
      '/hub/export',
    ].includes(url.pathname)
  );
}

export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number
): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Payload limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function bytesFromBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 128)
    throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
export function publisherMessage(
  userId: string,
  body: Uint8Array
): Uint8Array<ArrayBuffer> {
  const prefix = encoder.encode(
    `ops-hub-publisher-v2\nPOST\n/ingest\n${userId}\n`
  );
  const result = new Uint8Array(prefix.length + body.length);
  result.set(prefix);
  result.set(body, prefix.length);
  return result;
}
async function hmacKey(secret: string) {
  if (secret.length < 43 || secret.length > 256)
    throw new Error('Gateway unavailable');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
function assertionMessage(
  userId: string,
  issuedAt: number,
  expiresAt: number,
  method: string,
  target: string
) {
  return encoder.encode(
    `ops-hub-gateway-v1\n${userId}\n${issuedAt}\n${expiresAt}\n${method}\n${target}`
  );
}
export async function signAssertion(
  secret: string,
  userId: string,
  method: string,
  target: string,
  now = Date.now()
) {
  if (!UUID.test(userId)) throw new Error('Invalid identity');
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + 60;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    assertionMessage(userId, issuedAt, expiresAt, method, target)
  );
  return `${userId}.${issuedAt}.${expiresAt}.${base64(signature)}`;
}
export async function verifyAssertion(
  secret: string,
  assertion: string,
  method: string,
  target: string,
  now = Date.now()
) {
  if (assertion.length > 256) return null;
  const [userId, issued, expires, signature, extra] = assertion.split('.');
  if (
    extra ||
    !userId ||
    !UUID.test(userId) ||
    !signature ||
    !/^[0-9]{10}$/.test(issued ?? '') ||
    !/^[0-9]{10}$/.test(expires ?? '')
  )
    return null;
  const issuedAt = Number(issued);
  const expiresAt = Number(expires);
  const seconds = Math.floor(now / 1000);
  if (expiresAt - issuedAt !== 60 || issuedAt > seconds || seconds >= expiresAt)
    return null;
  try {
    return (await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      bytesFromBase64(signature),
      assertionMessage(userId, issuedAt, expiresAt, method, target)
    ))
      ? userId.toLowerCase()
      : null;
  } catch {
    return null;
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
