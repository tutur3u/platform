import type { Env } from './worker';

/**
 * Signed visitor address for Web's `TRUSTED_PROXY=cloudflare-origin` resolver
 * (`@tuturuuu/utils/abuse-protection/client-ip`). Behind the gateway every
 * web family request comes from the gateway Worker, so without this proof one
 * abuse block on that address hits every visitor behind it.
 *
 * The format and digest match `createOriginClientIpProof` in
 * `packages/utils/src/abuse-protection/origin-ip-proof.ts` byte for byte
 * (`origin-ip-proof.test.ts` cross-checks both). The gateway stays free of
 * workspace dependencies, so it signs with Web Crypto.
 */
export const ORIGIN_AUTH_HEADER = 'x-tuturuuu-origin-auth';
/** Calling Worker zone, trusted by Web only beside a valid proof. */
export const ORIGIN_WORKER_HEADER = 'x-tuturuuu-origin-worker';
export const ORIGIN_SECRET_NAME = 'TRUSTED_PROXY_ORIGIN_SECRET';
const MIN_SECRET_LENGTH = 32;

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

function isValidIpv6(value: string): boolean {
  if (value.length > 45) return false;
  let groups = value;
  let maxGroups = 8;
  const lastColon = groups.lastIndexOf(':');
  const tail = groups.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!IPV4_PATTERN.test(tail)) return false;
    groups = `${groups.slice(0, lastColon + 1)}0`;
    maxGroups = 7;
  }
  const halves = groups.split('::');
  if (halves.length > 2) return false;
  const parseHalf = (half: string) => (half === '' ? [] : half.split(':'));
  const head = parseHalf(halves[0] ?? '');
  const rest = halves.length === 2 ? parseHalf(halves[1] ?? '') : [];
  const all = [...head, ...rest];
  if (!all.every((group) => IPV6_GROUP_PATTERN.test(group))) return false;
  // The IPv4 tail occupies two 16-bit groups but was replaced by one.
  const groupCount = all.length + (maxGroups === 7 ? 1 : 0);
  return halves.length === 2 ? groupCount < 8 : groupCount === 8;
}

/** Same normalization as `normalizeClientIp` in the utils package. */
export function normalizeClientIp(raw: string | null | undefined) {
  let value = raw?.trim();
  if (!value) return null;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1]) {
    value = bracketed[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }
  const zoneIndex = value.indexOf('%');
  if (zoneIndex > 0 && value.includes(':')) value = value.slice(0, zoneIndex);
  const valid =
    IPV4_PATTERN.test(value) || (value.includes(':') && isValidIpv6(value));
  if (!valid) return null;
  return value.includes(':') ? value.toLowerCase() : value;
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function signingKey(secret: string) {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    // One key per isolate: a rotated secret replaces the cached one.
    keys.clear();
    keys.set(secret, key);
  }
  return key;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createOriginClientIpProof({
  ip,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  ip: string;
  secret: string;
  nowSeconds?: number;
}): Promise<string | null> {
  const normalized = normalizeClientIp(ip);
  if (
    !normalized ||
    secret.length < MIN_SECRET_LENGTH ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 1_000_000_000 ||
    nowSeconds > 9_999_999_999
  )
    return null;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(`tuturuuu-origin-client-ip/v1\n${nowSeconds}\n${normalized}`)
  );
  return `hmac-v1;${nowSeconds};${normalized};${hex(signature)}`;
}

let unsignedWarned = false;

function warnUnsigned(reason: string) {
  if (unsignedWarned) return;
  unsignedWarned = true;
  console.warn(
    `[gateway] ${ORIGIN_AUTH_HEADER} not sent: ${reason}; Web resolves the client IP from Vercel headers.`
  );
}

/**
 * The proof for this request's edge-set `cf-connecting-ip`, or null when the
 * secret is missing or too short or the address is invalid. Cloudflare
 * overwrites `cf-connecting-ip` on every request it proxies to the Worker, so
 * no client header (X-Forwarded-For, X-Real-IP, a sent proof) reaches it.
 */
export async function originAuthProof(request: Request, env: Env) {
  const raw = env[ORIGIN_SECRET_NAME];
  const secret = typeof raw === 'string' ? raw.trim() : '';
  if (secret.length < MIN_SECRET_LENGTH) {
    warnUnsigned(`${ORIGIN_SECRET_NAME} is missing or too short`);
    return null;
  }
  const proof = await createOriginClientIpProof({
    ip: request.headers.get('cf-connecting-ip') ?? '',
    secret,
  });
  if (!proof) warnUnsigned('the request has no valid cf-connecting-ip');
  return proof;
}

/** Replaces any proof and Worker zone on `headers` with the gateway's own, or removes them. */
export function withOriginAuth(headers: Headers, proof: string | null) {
  // Cloudflare stamps the gateway's own zone into CF-Worker on the origin
  // subrequest, so the calling Worker's zone (set by Cloudflare on the
  // incoming request, copied into `headers`) travels beside the proof.
  const worker = proof ? headers.get('cf-worker')?.trim() : undefined;
  if (worker) headers.set(ORIGIN_WORKER_HEADER, worker);
  else headers.delete(ORIGIN_WORKER_HEADER);
  if (proof) headers.set(ORIGIN_AUTH_HEADER, proof);
  else headers.delete(ORIGIN_AUTH_HEADER);
}

/** Test hook: re-arm the one-time warning. */
export function resetOriginAuthWarning() {
  unsignedWarned = false;
}
