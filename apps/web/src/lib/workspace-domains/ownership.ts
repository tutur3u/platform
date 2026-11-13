import { randomBytes } from 'node:crypto';

/** TXT record a customer publishes to prove control of a custom hostname. */
export const OWNERSHIP_TXT_PREFIX = '_tuturuuu-verify';
export const OWNERSHIP_VALUE_PREFIX = 'tuturuuu-domain-verification=';
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 5_000;

export function ownershipTxtName(hostname: string) {
  return `${OWNERSHIP_TXT_PREFIX}.${hostname}`;
}

/** A fresh, per-domain random token (256 bits, base64url). */
export function createOwnershipTxtValue() {
  return `${OWNERSHIP_VALUE_PREFIX}${randomBytes(32).toString('base64url')}`;
}

function unquote(data: string) {
  // DoH JSON returns TXT data as one or more quoted strings.
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/gu);
  if (!parts) return data;
  return parts.map((part) => part.slice(1, -1).replace(/\\"/gu, '"')).join('');
}

/**
 * Looks up TXT records with DNS-over-HTTPS. Returns null when the lookup
 * itself failed (callers keep the domain pending rather than failing it).
 */
export async function lookupTxtRecords(
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[] | null> {
  try {
    const response = await fetchImpl(
      `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=TXT`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      Status?: number;
      Answer?: Array<{ type?: number; data?: string }>;
    };
    if (body.Status !== 0 && body.Status !== 3) return null;
    return (body.Answer ?? [])
      .filter((answer) => answer.type === 16 && typeof answer.data === 'string')
      .map((answer) => unquote(answer.data as string));
  } catch {
    return null;
  }
}

export async function hasOwnershipProof(
  hostname: string,
  expectedValue: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean | null> {
  const records = await lookupTxtRecords(ownershipTxtName(hostname), fetchImpl);
  if (records === null) return null;
  return records.some((record) => record.trim() === expectedValue);
}
