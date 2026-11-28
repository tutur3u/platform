const MAX_BODY = 1024 * 1024;
const encoder = new TextEncoder();

export async function boundedBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const buffer = new Uint8Array(MAX_BODY);
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return buffer.subarray(0, bytes);
      if (bytes + value.length > MAX_BODY) {
        void reader.cancel().catch(() => {});
        return undefined;
      }
      buffer.set(value, bytes);
      bytes += value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function verifyWebhook(
  secret: string,
  header: string,
  bytes: Uint8Array<ArrayBuffer>
) {
  if (!/^sha256=[a-f0-9]{64}$/.test(header)) return false;
  const signature = new Uint8Array(32);
  for (let i = 0; i < signature.length; i++)
    signature[i] = Number.parseInt(header.slice(7 + i * 2, 9 + i * 2), 16);
  return crypto.subtle.verify('HMAC', await hmacKey(secret), signature, bytes);
}

export async function authorized(request: Request, secret: string | undefined) {
  const header = request.headers.get('Authorization');
  if (!secret || !header?.startsWith('Bearer ') || header.length > 512)
    return false;
  const key = await hmacKey(secret);
  const expected = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(secret)
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    expected,
    encoder.encode(header.slice(7))
  );
}
