import { fromBase64Url, fromUtf8, toBase64Url, utf8 } from './encoding';

type Keys = { seal: CryptoKey; sign: CryptoKey; subject: CryptoKey };
const cache = new Map<string, Promise<Keys>>();
const AAD = utf8.encode('tuturuuu/human-check/v1');

async function derive(secret: string): Promise<Keys> {
  if (secret.length < 32) throw new Error('HUMAN_CHECK_SECRET is too short');
  const base = await crypto.subtle.importKey(
    'raw',
    utf8.encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  );
  const params = (info: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: utf8.encode('tuturuuu-human-check'),
    info: utf8.encode(info),
  });
  const hmac = { name: 'HMAC', hash: 'SHA-256', length: 256 };
  return {
    seal: await crypto.subtle.deriveKey(
      params('seal'),
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    ),
    sign: await crypto.subtle.deriveKey(params('pass'), base, hmac, false, [
      'sign',
      'verify',
    ]),
    subject: await crypto.subtle.deriveKey(
      params('subject'),
      base,
      hmac,
      false,
      ['sign']
    ),
  };
}

function keys(secret: string) {
  let entry = cache.get(secret);
  if (!entry) {
    if (cache.size > 4) cache.clear();
    entry = derive(secret);
    cache.set(secret, entry);
  }
  return entry;
}

/** Encrypts and authenticates server-only state for the client to carry. */
export async function seal(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    (await keys(secret)).seal,
    utf8.encode(JSON.stringify(value))
  );
  const out = new Uint8Array(12 + data.byteLength);
  out.set(iv);
  out.set(new Uint8Array(data), 12);
  return toBase64Url(out);
}

export async function unseal<T>(
  secret: string,
  token: string
): Promise<T | null> {
  try {
    const bytes = fromBase64Url(token);
    if (bytes.length < 29 || bytes.length > 4096) return null;
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: AAD },
      (await keys(secret)).seal,
      bytes.subarray(12)
    );
    return JSON.parse(fromUtf8.decode(data)) as T;
  } catch {
    return null;
  }
}

/** Signs a readable payload: `<payload>.<mac>`. */
export async function sign(secret: string, value: unknown): Promise<string> {
  const payload = toBase64Url(utf8.encode(JSON.stringify(value)));
  const mac = await crypto.subtle.sign(
    'HMAC',
    (await keys(secret)).sign,
    utf8.encode(payload)
  );
  return `${payload}.${toBase64Url(new Uint8Array(mac))}`;
}

export async function verifySigned<T>(
  secret: string,
  token: string
): Promise<T | null> {
  try {
    if (token.length > 2048) return null;
    const [payload, mac, extra] = token.split('.');
    if (!payload || !mac || extra !== undefined) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      (await keys(secret)).sign,
      fromBase64Url(mac),
      utf8.encode(payload)
    );
    return valid
      ? (JSON.parse(fromUtf8.decode(fromBase64Url(payload))) as T)
      : null;
  } catch {
    return null;
  }
}

/** Keyed hash of a network or other subject; raw values never enter tokens. */
export async function hashSubject(
  secret: string,
  value: string
): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    (await keys(secret)).subject,
    utf8.encode(value)
  );
  return toBase64Url(new Uint8Array(mac)).slice(0, 22);
}
