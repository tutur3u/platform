/**
 * The key guard's signed list response. `GET /<env>` returns
 * `{ payload, keyId, sig }`: `payload` is the base64url of the RFC 8785
 * canonical bytes of the list, and `sig` is Ed25519 over exactly those bytes
 * with the guard key the pin names. Every isolate verifies the bytes itself,
 * so the store that forwards them cannot forge a list.
 */
import {
  canonicalJson,
  decodeBase64Url,
  hasOwn,
  isJsonObject,
  type JsonValue,
  parseStrictJson,
} from '../encoding';
import { isTimestamp, isTokenClass, KID_PATTERN } from '../token-core';

/** A served list may be at most this far ahead of the isolate clock. */
export const GUARD_FUTURE_TOLERANCE_MS = 5_000;
/** Larger response bodies are rejected before any parsing. */
export const MAX_GUARD_RESPONSE_BYTES = 65_536;

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
// Printable ASCII without quotes or backslashes, so this package's canonical
// serializer and RFC 8785 produce the same bytes for every valid payload.
const ENV_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const VERSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const DOCUMENT_MEMBERS = ['keyId', 'payload', 'sig'];
const PAYLOAD_MEMBERS = [
  'env',
  'gatewayVersions',
  'identityBlocked',
  'issuedAtMs',
  'kids',
  'listVersion',
  'mintHalt',
];

/** One pinned guard public key: raw Ed25519 bytes as unpadded base64url. */
export type GuardPinKey = Readonly<{ keyId: string; publicKey: string }>;

/** The per-environment pin from reviewed source. */
export type GuardPin = Readonly<{
  current: GuardPinKey;
  previous?: GuardPinKey | null;
}>;

/** One armed emergency `kid`, in the shape `TTR_TOKEN_EMERGENCY_KIDS` lists. */
export type GuardKid = Readonly<{ class: string; kid: string }>;

/** A verified list. `gatewayVersions` is always sorted. */
export type GuardList = Readonly<{
  env: string;
  kids: readonly GuardKid[];
  listVersion: number;
  mintHalt: boolean;
  gatewayVersions: readonly string[];
  identityBlocked: boolean;
  issuedAtMs: number;
}>;

export type GuardResponseFailure =
  | 'bad_pin'
  | 'malformed'
  | 'unknown_key'
  | 'bad_signature'
  | 'non_canonical'
  | 'bad_payload'
  | 'wrong_env'
  | 'future_issued';

export type GuardResponseResult =
  | Readonly<{ ok: true; list: GuardList; body: string }>
  | Readonly<{ ok: false; reason: GuardResponseFailure }>;

const fail = (reason: GuardResponseFailure): GuardResponseResult =>
  Object.freeze({ ok: false, reason });

function hasExactMembers(
  value: { [key: string]: JsonValue },
  members: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === members.length &&
    members.every((member) => hasOwn(value, member))
  );
}

function pinKeys(pin: GuardPin | null | undefined): GuardPinKey[] | null {
  const keys = [pin?.current, pin?.previous].filter(
    (key): key is GuardPinKey => key !== undefined && key !== null
  );
  if (!pin?.current) return null;
  for (const key of keys) {
    if (
      typeof key.keyId !== 'string' ||
      !KEY_ID_PATTERN.test(key.keyId) ||
      typeof key.publicKey !== 'string' ||
      decodeBase64Url(key.publicKey)?.length !== ED25519_PUBLIC_KEY_BYTES
    ) {
      return null;
    }
  }
  if (keys.length === 2 && keys[0]?.keyId === keys[1]?.keyId) return null;
  return keys;
}

async function verifyEd25519(
  publicKey: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature,
      message
    );
  } catch {
    return false;
  }
}

function readKids(value: JsonValue | undefined): GuardKid[] | null {
  if (!Array.isArray(value)) return null;
  const kids: GuardKid[] = [];
  const classes = new Set<string>();
  for (const listing of value) {
    if (
      !isJsonObject(listing) ||
      !hasExactMembers(listing, ['class', 'kid']) ||
      !isTokenClass(listing.class) ||
      typeof listing.kid !== 'string' ||
      !KID_PATTERN.test(listing.kid) ||
      classes.has(listing.class)
    ) {
      return null;
    }
    classes.add(listing.class);
    kids.push(Object.freeze({ class: listing.class, kid: listing.kid }));
  }
  return kids;
}

function readVersions(value: JsonValue | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const versions = new Set<string>();
  for (const version of value) {
    if (
      typeof version !== 'string' ||
      !VERSION_ID_PATTERN.test(version) ||
      versions.has(version)
    ) {
      return null;
    }
    versions.add(version);
  }
  return [...versions].sort();
}

/** Reads the closed member set of a canonical, already verified payload. */
function readPayload(value: JsonValue | undefined): GuardList | null {
  if (!isJsonObject(value) || !hasExactMembers(value, PAYLOAD_MEMBERS)) {
    return null;
  }
  const kids = readKids(value.kids);
  const gatewayVersions = readVersions(value.gatewayVersions);
  if (
    typeof value.env !== 'string' ||
    !ENV_PATTERN.test(value.env) ||
    !isTimestamp(value.listVersion) ||
    !isTimestamp(value.issuedAtMs) ||
    typeof value.mintHalt !== 'boolean' ||
    typeof value.identityBlocked !== 'boolean' ||
    !kids ||
    !gatewayVersions
  ) {
    return null;
  }
  return Object.freeze({
    env: value.env,
    kids: Object.freeze(kids),
    listVersion: value.listVersion,
    mintHalt: value.mintHalt,
    gatewayVersions: Object.freeze(gatewayVersions),
    identityBlocked: value.identityBlocked,
    issuedAtMs: value.issuedAtMs,
  });
}

/**
 * Verifies a guard response body against the pin. It is valid only when its
 * `keyId` names the pin's `current` or `previous` key, `sig` verifies over
 * the exact payload bytes, the payload is canonical JSON with the closed
 * member set and no duplicate member, `env` is `expectedEnv`, and
 * `issuedAtMs` is at most 5 seconds ahead of `nowMs`. It never throws.
 */
export async function verifyGuardResponse(
  body: string,
  input: { pin: GuardPin; expectedEnv: string; nowMs: number }
): Promise<GuardResponseResult> {
  const keys = pinKeys(input?.pin);
  if (!keys) return fail('bad_pin');
  if (typeof body !== 'string' || body.length > MAX_GUARD_RESPONSE_BYTES) {
    return fail('malformed');
  }
  const outer = parseStrictJson(body);
  if (
    !isJsonObject(outer) ||
    !hasExactMembers(outer, DOCUMENT_MEMBERS) ||
    typeof outer.keyId !== 'string' ||
    typeof outer.payload !== 'string' ||
    typeof outer.sig !== 'string'
  ) {
    return fail('malformed');
  }
  const key = keys.find((candidate) => candidate.keyId === outer.keyId);
  if (!key) return fail('unknown_key');
  const payloadBytes = decodeBase64Url(outer.payload);
  const signature = decodeBase64Url(outer.sig);
  const publicKey = decodeBase64Url(key.publicKey);
  if (!payloadBytes || !publicKey) return fail('malformed');
  if (
    signature?.length !== ED25519_SIGNATURE_BYTES ||
    !(await verifyEd25519(publicKey, signature, payloadBytes))
  ) {
    return fail('bad_signature');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      payloadBytes
    );
  } catch {
    return fail('non_canonical');
  }
  const parsed = parseStrictJson(text);
  if (parsed === undefined || canonicalJson(parsed) !== text) {
    return fail('non_canonical');
  }
  const list = readPayload(parsed);
  if (!list) return fail('bad_payload');
  if (list.env !== input.expectedEnv) return fail('wrong_env');
  if (
    !isTimestamp(input.nowMs) ||
    list.issuedAtMs - input.nowMs > GUARD_FUTURE_TOLERANCE_MS
  ) {
    return fail('future_issued');
  }
  return Object.freeze({ ok: true, list, body });
}
