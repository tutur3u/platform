import {
  constantTimeEqual,
  decodeBase64Url,
  encodeBase64Url,
  utf8,
} from './encoding';
import type { SessionEnvironment } from './principal';

export const SESSION_COOKIE_NAME = '__Host-ttr_session';
export const SESSION_COOKIE_MAX_BYTES = 128;
export const MAX_GENERATION = 2_147_483_647;

const COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Lax';
const MAC_LABEL = 'ttr-session-mac/v1';
const MAC_BYTES = 16;
const VALUE_PATTERN =
  /^v1\.([A-Za-z0-9_-]{22})\.(0|[1-9]\d{0,9})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{22})$/;

export type SessionCookie = {
  version: 'v1';
  device: string;
  generation: number;
  secret: string;
  mac: string;
};

export type SessionCookieRead =
  | { kind: 'absent' }
  | { kind: 'ambiguous' }
  | { kind: 'malformed' }
  | { kind: 'present'; cookie: SessionCookie };

/** Binds a MAC to one environment and one host. */
export type CookieMacScope = {
  environment: SessionEnvironment;
  host: string;
};

/** Parses one cookie value. Returns null unless every part is canonical. */
export function parseSessionCookieValue(value: string): SessionCookie | null {
  if (value.length > SESSION_COOKIE_MAX_BYTES) return null;
  const match = VALUE_PATTERN.exec(value);
  if (!match) return null;
  const [, device = '', generationText = '', secret = '', mac = ''] = match;
  const generation = Number(generationText);
  if (!Number.isSafeInteger(generation) || generation > MAX_GENERATION) {
    return null;
  }
  const deviceBytes = decodeBase64Url(device);
  const secretBytes = decodeBase64Url(secret);
  const macBytes = decodeBase64Url(mac);
  if (
    deviceBytes?.length !== 16 ||
    secretBytes?.length !== 32 ||
    macBytes?.length !== MAC_BYTES
  ) {
    return null;
  }
  return { version: 'v1', device, generation, secret, mac };
}

/**
 * Reads the session cookie from the raw `Cookie` field values, one string per
 * field. A name that appears more than once, even across split fields, is
 * ambiguous and must be treated as signed out. Pairs are separated by `;`,
 * and also by `,` so that an adapter that joined fields with commas cannot
 * hide a duplicate. Only spaces and tabs are trimmed.
 */
export function readSessionCookie(
  cookieHeader: string | readonly string[] | null | undefined
): SessionCookieRead {
  const fields =
    cookieHeader == null
      ? []
      : typeof cookieHeader === 'string'
        ? [cookieHeader]
        : cookieHeader;
  const values: string[] = [];
  for (const field of fields) {
    for (const pair of field.split(/[;,]/)) {
      const separator = pair.indexOf('=');
      const name = trimOws(separator === -1 ? pair : pair.slice(0, separator));
      if (name === SESSION_COOKIE_NAME) {
        values.push(separator === -1 ? '' : trimOws(pair.slice(separator + 1)));
      }
    }
  }
  if (values.length === 0) return { kind: 'absent' };
  if (values.length > 1) return { kind: 'ambiguous' };
  const cookie = parseSessionCookieValue(values[0] ?? '');
  return cookie ? { kind: 'present', cookie } : { kind: 'malformed' };
}

function trimOws(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, '');
}

/**
 * The MAC scope host is the hostname from trusted routing: no port, no
 * trailing dot and no whitespace. Letters are compared case-insensitively.
 */
function normalizeHost(host: string): string | null {
  const normalized = host.toLowerCase();
  return /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(
    normalized
  )
    ? normalized
    : null;
}

/** The MAC key must be HMAC with SHA-256 and allowed to sign. */
function isMacKey(key: CryptoKey): boolean {
  const algorithm = key.algorithm as { name: string; hash?: { name: string } };
  return (
    algorithm.name === 'HMAC' &&
    algorithm.hash?.name === 'SHA-256' &&
    key.usages.includes('sign')
  );
}

async function macBytes(
  key: CryptoKey,
  scope: CookieMacScope,
  device: string,
  generation: number,
  secret: string
): Promise<Uint8Array | null> {
  const host = normalizeHost(scope.host);
  if (!host || !isMacKey(key)) return null;
  const input = `${MAC_LABEL}|${scope.environment}|${host}|${device}.${generation}.${secret}`;
  const full = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, utf8(input))
  );
  return full.slice(0, MAC_BYTES);
}

/** Builds a cookie value. The caller supplies fresh random device and secret bytes. */
export async function encodeSessionCookieValue(input: {
  device: Uint8Array;
  generation: number;
  secret: Uint8Array;
  key: CryptoKey;
  scope: CookieMacScope;
}): Promise<string> {
  if (input.device.length !== 16 || input.secret.length !== 32) {
    throw new RangeError(
      'Session cookie needs 16 device bytes and 32 secret bytes'
    );
  }
  if (
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    input.generation > MAX_GENERATION
  ) {
    throw new RangeError('Session cookie generation is out of range');
  }
  const device = encodeBase64Url(input.device);
  const secret = encodeBase64Url(input.secret);
  const mac = await macBytes(
    input.key,
    input.scope,
    device,
    input.generation,
    secret
  );
  if (!mac) {
    throw new RangeError('Session cookie host or MAC key is invalid');
  }
  return `v1.${device}.${input.generation}.${secret}.${encodeBase64Url(mac)}`;
}

/**
 * Checks the admission MAC against the current key and at most one previous
 * key. A valid MAC only admits the cookie to a storage lookup; the stored
 * secret hash still decides whether the session exists.
 */
export async function verifySessionCookieMac(
  cookie: SessionCookie,
  options: { keys: readonly CryptoKey[]; scope: CookieMacScope }
): Promise<boolean> {
  const presented = decodeBase64Url(cookie.mac);
  if (!presented || options.keys.length === 0 || options.keys.length > 2) {
    return false;
  }
  let matched = false;
  for (const key of options.keys) {
    let expected: Uint8Array | null;
    try {
      expected = await macBytes(
        key,
        options.scope,
        cookie.device,
        cookie.generation,
        cookie.secret
      );
    } catch {
      expected = null;
    }
    if (expected && constantTimeEqual(expected, presented)) matched = true;
  }
  return matched;
}

/** Whole seconds until the deadline, rounded down. Zero or less means clear. */
export function sessionCookieMaxAge(deadlineMs: number, nowMs: number): number {
  return Math.floor((deadlineMs - nowMs) / 1000);
}

export function serializeSessionCookie(
  value: string,
  maxAgeSeconds: number
): string {
  if (
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0 ||
    parseSessionCookieValue(value) === null
  ) {
    return clearSessionCookie();
  }
  return `${SESSION_COOKIE_NAME}=${value}; Max-Age=${maxAgeSeconds}; ${COOKIE_ATTRIBUTES}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}
