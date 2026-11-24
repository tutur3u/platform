import { ProviderError } from './collector';
import { fetchProviderJson, type ProviderFetchDeps } from './provider-fetch';

// GitHub App authentication for the GitHub Actions collector. The app is
// owned by the tutur3u org, installed on tutur3u/platform only, with Actions
// read and Metadata read. A short RS256 JWT (WebCrypto, no Node imports) is
// exchanged for an installation token down-scoped to one repository and
// Actions read; the token is cached per isolate until five minutes before it
// expires. Every failure throws and clears the cache, so the run fails closed
// and never falls back to another credential mid-run.

export const GITHUB_APP_REPOSITORY_NAME = 'platform';
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
// GitHub rejects JWTs that expire more than ten minutes ahead.
const JWT_LIFETIME_S = 9 * 60;
const JWT_BACKDATE_S = 60;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const TOKEN = /^[A-Za-z0-9_]{20,255}$/;

export interface GithubAppCredentials {
  appId: string;
  installationId: string;
  privateKeyPem: string;
}

/** Valid app configuration, or null when any part is missing or malformed. */
export function parseGithubAppCredentials(env: {
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}): GithubAppCredentials | null {
  const appId = env.GITHUB_APP_ID?.trim() ?? '';
  const installationId = env.GITHUB_APP_INSTALLATION_ID?.trim() ?? '';
  // Secrets pasted as one line keep literal "\n" escapes.
  const privateKeyPem = (env.GITHUB_APP_PRIVATE_KEY ?? '')
    .replace(/\\n/g, '\n')
    .trim();
  if (
    !NUMERIC_ID.test(appId) ||
    !NUMERIC_ID.test(installationId) ||
    !/^-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKeyPem)
  )
    return null;
  return { appId, installationId, privateKeyPem };
}

/** True when any GitHub App variable is set, valid or not. */
export function hasAnyGithubAppVariable(env: {
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}) {
  return Boolean(
    env.GITHUB_APP_ID?.trim() ||
    env.GITHUB_APP_INSTALLATION_ID?.trim() ||
    env.GITHUB_APP_PRIVATE_KEY?.trim()
  );
}

function derLength(length: number) {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function der(tag: number, body: Uint8Array) {
  const head = [tag, ...derLength(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// AlgorithmIdentifier { rsaEncryption, NULL }
const RSA_ALGORITHM = new Uint8Array([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
]);

/**
 * PKCS#8 DER for WebCrypto. GitHub issues PKCS#1 ("RSA PRIVATE KEY") keys,
 * which are wrapped in a PrivateKeyInfo; PKCS#8 keys pass through.
 */
export function privateKeyToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const match =
    /^-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (RSA )?PRIVATE KEY-----$/.exec(
      pem.trim()
    );
  if (!match || Boolean(match[1]) !== Boolean(match[3]))
    throw new ProviderError('invalid');
  let raw: string;
  try {
    raw = atob(match[2]!.replace(/\s+/g, ''));
  } catch {
    throw new ProviderError('invalid');
  }
  const body = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  if (!match[1]) return body;
  return der(
    0x30,
    concat(new Uint8Array([0x02, 0x01, 0x00]), RSA_ALGORITHM, der(0x04, body))
  );
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const jsonPart = (value: unknown) =>
  base64url(encoder.encode(JSON.stringify(value)));

export async function importGithubAppKey(pem: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      privateKeyToPkcs8(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } catch {
    throw new ProviderError('invalid');
  }
}

/** RS256 app JWT, backdated a minute for clock skew, valid nine minutes. */
export async function signGithubAppJwt(
  appId: string,
  key: CryptoKey,
  nowMs: number
): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  const input = `${jsonPart({ alg: 'RS256', typ: 'JWT' })}.${jsonPart({
    exp: now + JWT_LIFETIME_S,
    iat: now - JWT_BACKDATE_S,
    iss: appId,
  })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(input)
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

interface CachedToken {
  expiresAt: number;
  token: string;
}

export interface GithubAppTokenSource {
  /** A cached token usable now (outside the refresh margin), or null. */
  cached: (now: number) => string | null;
  /** Drops the cached token, e.g. after the provider rejected a request. */
  invalidate: () => void;
  /** One provider request: exchanges a fresh app JWT for a token. */
  mint: (deps: ProviderFetchDeps) => Promise<string>;
}

/**
 * Token source for one app installation. Keep one instance per isolate so the
 * cache survives across scheduled runs; see `githubAppTokenSource`.
 */
export function createGithubAppTokenSource(
  credentials: GithubAppCredentials
): GithubAppTokenSource {
  let cache: CachedToken | null = null;
  let key: Promise<CryptoKey> | null = null;
  return {
    cached(now) {
      if (cache && now < cache.expiresAt - TOKEN_REFRESH_MARGIN_MS)
        return cache.token;
      cache = null;
      return null;
    },
    invalidate() {
      cache = null;
    },
    async mint(deps) {
      cache = null;
      try {
        key ??= importGithubAppKey(credentials.privateKeyPem);
        const jwt = await signGithubAppJwt(
          credentials.appId,
          await key,
          deps.now()
        );
        const { json } = await fetchProviderJson(
          deps,
          new URL(
            `https://api.github.com/app/installations/${credentials.installationId}/access_tokens`
          ),
          {
            method: 'POST',
            body: JSON.stringify({
              permissions: { actions: 'read', metadata: 'read' },
              repositories: [GITHUB_APP_REPOSITORY_NAME],
            }),
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Tuturuuu-Cron-Control/1.0',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          }
        );
        const record = json as { expires_at?: unknown; token?: unknown };
        const expiresAt =
          typeof record?.expires_at === 'string'
            ? Date.parse(record.expires_at)
            : Number.NaN;
        if (
          typeof record?.token !== 'string' ||
          !TOKEN.test(record.token) ||
          !Number.isFinite(expiresAt) ||
          expiresAt <= deps.now()
        )
          throw new ProviderError('invalid');
        cache = { expiresAt, token: record.token };
        return record.token;
      } catch (error) {
        cache = null;
        // A key that failed to import stays failed until the secret changes.
        if (error instanceof ProviderError) throw error;
        if (error instanceof DOMException) throw error;
        throw new ProviderError('invalid');
      }
    },
  };
}

let current: {
  credentials: GithubAppCredentials;
  source: GithubAppTokenSource;
} | null = null;

/**
 * Isolate-wide source for the configured installation. A change to any
 * credential field replaces it, so a cached token never outlives its key.
 */
export function githubAppTokenSource(
  credentials: GithubAppCredentials
): GithubAppTokenSource {
  const same =
    current &&
    current.credentials.appId === credentials.appId &&
    current.credentials.installationId === credentials.installationId &&
    current.credentials.privateKeyPem === credentials.privateKeyPem;
  if (!same)
    current = { credentials, source: createGithubAppTokenSource(credentials) };
  return current!.source;
}
