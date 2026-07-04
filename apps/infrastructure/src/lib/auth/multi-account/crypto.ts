import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import {
  LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
  WEB_ACCOUNT_DEVICE_COOKIE_NAME,
} from './types';

const COOKIE_VERSION = 'v1';
const SESSION_CIPHER_VERSION = 'v1';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const PARENT_DOMAIN_COOKIE_HOSTS = [
  {
    domain: '.tuturuuu.com',
    matches: (hostname: string) =>
      hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com'),
    secure: true,
  },
  {
    domain: '.tuturuuu.localhost',
    matches: (hostname: string) =>
      hostname === 'tuturuuu.localhost' ||
      hostname.endsWith('.tuturuuu.localhost'),
    secure: false,
  },
];

type DeviceCookieOptions = {
  domain?: string;
  httpOnly: true;
  maxAge: number;
  path: string;
  sameSite: 'lax';
  secure: boolean;
};

export function resolveMultiAccountSecret(
  env: Partial<NodeJS.ProcessEnv> = process.env
) {
  return (
    env.WEB_MULTI_ACCOUNT_SESSION_SECRET?.trim() ||
    env.SUPABASE_SECRET_KEY?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    env.SUPABASE_SERVICE_KEY?.trim() ||
    null
  );
}

function requireMultiAccountSecret() {
  const secret = resolveMultiAccountSecret();

  if (!secret) {
    throw new Error(
      'Missing WEB_MULTI_ACCOUNT_SESSION_SECRET or Supabase service secret'
    );
  }

  return secret;
}

function deriveKey(purpose: string) {
  return createHmac('sha256', requireMultiAccountSecret())
    .update(`tuturuuu:web-multi-account:${purpose}:v1`)
    .digest();
}

function toBase64Url(value: Buffer) {
  return value.toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function signDeviceCookiePayload(payload: string) {
  return toBase64Url(
    createHmac('sha256', deriveKey('device-cookie-signing'))
      .update(payload)
      .digest()
  );
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function createDeviceSecret() {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceSecret(secret: string) {
  return toBase64Url(
    createHmac('sha256', deriveKey('device-secret-hash'))
      .update(secret)
      .digest()
  );
}

export function createDeviceCookieValue(deviceId: string, secret: string) {
  const payload = `${COOKIE_VERSION}.${deviceId}.${secret}`;
  return `${payload}.${signDeviceCookiePayload(payload)}`;
}

export function parseDeviceCookieValue(
  value: string | undefined
): { deviceId: string; secret: string } | null {
  if (!value) {
    return null;
  }

  const [version, deviceId, secret, signature, ...extra] = value.split('.');

  if (
    extra.length > 0 ||
    version !== COOKIE_VERSION ||
    !deviceId ||
    !secret ||
    !signature
  ) {
    return null;
  }

  const payload = `${version}.${deviceId}.${secret}`;
  const expectedSignature = signDeviceCookiePayload(payload);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  return { deviceId, secret };
}

export function encryptSession(session: SupabaseSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveKey('session-encryption'),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SESSION_CIPHER_VERSION,
    toBase64Url(iv),
    toBase64Url(tag),
    toBase64Url(ciphertext),
  ].join('.');
}

export function decryptSession(ciphertext: string) {
  const [version, iv, tag, encrypted, ...extra] = ciphertext.split('.');

  if (
    extra.length > 0 ||
    version !== SESSION_CIPHER_VERSION ||
    !iv ||
    !tag ||
    !encrypted
  ) {
    throw new Error('Invalid multi-account session payload');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey('session-encryption'),
    fromBase64Url(iv)
  );
  decipher.setAuthTag(fromBase64Url(tag));

  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(encrypted)),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plaintext) as SupabaseSession;
}

function extractForwardedValue(value: string | null) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);
}

function isSecureCookieScheme(requestUrl: URL) {
  if (requestUrl.protocol !== 'https:') {
    return false;
  }

  // Local dev and E2E are served over HTTPS by portless using an untrusted
  // local certificate. Chromium accepts the navigation but refuses to persist
  // or resend Secure/__Host- cookies from a cert-errored connection, which
  // breaks the multi-account device cookie. Treat localhost-style hosts as
  // insecure so they fall back to the legacy (non-Secure) device cookie while
  // genuine public HTTPS hosts keep the hardened __Host- cookie.
  const hostname = requestUrl.hostname;
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return false;
  }

  return true;
}

function resolveCookieUrl(request: Pick<Request, 'headers' | 'url'>) {
  const forwardedHost =
    extractForwardedValue(request.headers.get('x-forwarded-host')) ??
    extractForwardedValue(request.headers.get('host'));
  const forwardedProto =
    extractForwardedValue(request.headers.get('x-forwarded-proto')) ??
    undefined;

  if (forwardedHost && !/[\r\n]/u.test(forwardedHost)) {
    const protocol =
      forwardedProto?.replace(/:$/u, '') === 'http' ? 'http' : 'https';
    return new URL(`${protocol}://${forwardedHost}`);
  }

  return new URL(request.url);
}

export function getDeviceCookieOptions(
  request: Pick<Request, 'headers' | 'url'>
) {
  const requestUrl = resolveCookieUrl(request);

  return {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: isSecureCookieScheme(requestUrl),
  } satisfies DeviceCookieOptions;
}

export function getDeviceCookieName(request: Pick<Request, 'headers' | 'url'>) {
  const requestUrl = resolveCookieUrl(request);

  return isSecureCookieScheme(requestUrl)
    ? WEB_ACCOUNT_DEVICE_COOKIE_NAME
    : LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME;
}

export function getExpiredDeviceCookieOptions(
  request: Pick<Request, 'headers' | 'url'>
) {
  return {
    ...getDeviceCookieOptions(request),
    maxAge: 0,
  };
}

export function getLegacyDeviceCookieClearOptions(
  request: Pick<Request, 'headers' | 'url'>
) {
  const requestUrl = resolveCookieUrl(request);
  const hostOnlyOptions = {
    ...getExpiredDeviceCookieOptions(request),
  } satisfies DeviceCookieOptions;
  const parentDomain = PARENT_DOMAIN_COOKIE_HOSTS.find((entry) =>
    entry.matches(requestUrl.hostname)
  );

  if (!parentDomain) {
    return [hostOnlyOptions];
  }

  return [
    hostOnlyOptions,
    {
      ...hostOnlyOptions,
      domain: parentDomain.domain,
      secure: parentDomain.secure,
    },
  ];
}

export {
  LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
  WEB_ACCOUNT_DEVICE_COOKIE_NAME,
};
