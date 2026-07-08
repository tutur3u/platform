import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import {
  getHostOnlyCookieOptions,
  getTuturuuuSharedCookieOptions,
  resolveTuturuuuSharedCookieDomain,
} from '@tuturuuu/utils/shared-cookie';
import {
  LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
  WEB_ACCOUNT_DEVICE_COOKIE_NAME,
} from './types';

const COOKIE_VERSION = 'v1';
const SESSION_CIPHER_VERSION = 'v1';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

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
): DeviceCookieOptions {
  const requestUrl = resolveCookieUrl(request);
  const sharedOptions = getTuturuuuSharedCookieOptions(
    {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: isSecureCookieScheme(requestUrl),
    } satisfies DeviceCookieOptions,
    request
  );

  return sharedOptions satisfies DeviceCookieOptions;
}

export function getDeviceCookieName(request: Pick<Request, 'headers' | 'url'>) {
  const requestUrl = resolveCookieUrl(request);

  return resolveTuturuuuSharedCookieDomain(request)
    ? LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME
    : isSecureCookieScheme(requestUrl)
      ? WEB_ACCOUNT_DEVICE_COOKIE_NAME
      : LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME;
}

export function getDeviceCookieReadNames(
  request: Pick<Request, 'headers' | 'url'>
) {
  const primary = getDeviceCookieName(request);
  const fallback =
    primary === LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME
      ? WEB_ACCOUNT_DEVICE_COOKIE_NAME
      : LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME;

  return [primary, fallback] as const;
}

export function getExpiredDeviceCookieOptions(
  request: Pick<Request, 'headers' | 'url'>
): DeviceCookieOptions {
  return {
    ...getDeviceCookieOptions(request),
    maxAge: 0,
  };
}

export function getLegacyDeviceCookieClearOptions(
  request: Pick<Request, 'headers' | 'url'>
) {
  const hostOnlyOptions = getHostOnlyCookieOptions({
    ...getExpiredDeviceCookieOptions(request),
  } satisfies DeviceCookieOptions);
  const sharedOptions = getExpiredDeviceCookieOptions(request);

  if (!sharedOptions.domain) {
    return [hostOnlyOptions];
  }

  return [hostOnlyOptions, sharedOptions];
}

export function getStaleDeviceCookieClearTargets(
  request: Pick<Request, 'headers' | 'url'>
) {
  const activeCookieName = getDeviceCookieName(request);
  const activeOptions = getDeviceCookieOptions(request);
  const hostOnlyOptions = getHostOnlyCookieOptions({
    ...activeOptions,
    maxAge: 0,
  } satisfies DeviceCookieOptions);
  const hostPrefixedClearOptions = {
    ...hostOnlyOptions,
    secure: true,
  } satisfies DeviceCookieOptions;

  if (
    activeCookieName === LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME &&
    activeOptions.domain
  ) {
    return [
      {
        name: LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: hostOnlyOptions,
      },
      {
        name: WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: hostPrefixedClearOptions,
      },
    ];
  }

  if (activeCookieName === WEB_ACCOUNT_DEVICE_COOKIE_NAME) {
    return getLegacyDeviceCookieClearOptions(request).map((options) => ({
      name: LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
      options,
    }));
  }

  return [
    {
      name: WEB_ACCOUNT_DEVICE_COOKIE_NAME,
      options: hostPrefixedClearOptions,
    },
  ];
}

export function getAllDeviceCookieClearTargets(
  request: Pick<Request, 'headers' | 'url'>
) {
  const activeCookieName = getDeviceCookieName(request);
  const activeOptions = getExpiredDeviceCookieOptions(request);
  const targets = [
    { name: activeCookieName, options: activeOptions },
    ...getStaleDeviceCookieClearTargets(request),
  ];
  const seen = new Set<string>();

  return targets.filter((target) => {
    const key = [
      target.name,
      target.options.domain ?? '',
      target.options.path,
      target.options.secure ? 'secure' : 'insecure',
    ].join('\0');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export {
  LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
  WEB_ACCOUNT_DEVICE_COOKIE_NAME,
};
