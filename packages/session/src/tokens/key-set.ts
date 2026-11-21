/**
 * Parses `TTR_TOKEN_SIGNING_KEYS` (signer mode) and the internal key set given
 * to verifiers (verifier mode). JSON outside the `KeySet` shape fails as a
 * whole; inside a valid key set, an entry that breaks a rule is
 * disabled alone. All times are seconds.
 */
import { isJsonObject, parseStrictJson, utf8 } from '../encoding';
import {
  isTimestamp,
  isTokenClass,
  KID_PATTERN,
  MAX_TOKEN_LIFETIME_SECONDS,
  TOKEN_CLASSES,
  type TokenClass,
} from '../token-core';
import type { EmergencyKids } from './emergency';
import { mintableAt, type ObservationCache } from './observations';
import {
  type EcPrivateJwk,
  type EcPublicJwk,
  importPublicJwk,
  jwkThumbprint,
  readEcJwk,
} from './thumbprint';

export const DAY_SECONDS = 86_400;
export const SIGNING_WINDOW_SECONDS = 7_776_000;
const MAX_DOCUMENT_BYTES = 256 * 1024;

export type KeyStatus = 'next' | 'active' | 'retired';
export type KeySetMode = 'verifier' | 'signer';

/** One configured entry of the key-set JSON. */
export type KeySetEntry = {
  kid: string;
  class: TokenClass;
  status: KeyStatus;
  /** Untrusted and informational; never an input to `mintableAt`. */
  publishedAt: number;
  notBefore: number;
  retiredAt?: number;
  notAfter: number;
  publicJwk: EcPublicJwk;
  privateJwk?: EcPrivateJwk;
};

/** The key-set JSON shape. */
export type KeySetDocument = { entries: KeySetEntry[]; deniedKids: string[] };

/** An enabled entry. It never retains private key material as text. */
export type ParsedKeyEntry = Readonly<{
  kid: string;
  class: TokenClass;
  status: KeyStatus;
  publishedAt: number;
  notBefore: number;
  retiredAt: number | null;
  notAfter: number;
  publicJwk: EcPublicJwk;
  thumbprint: string;
  publicKey: CryptoKey;
  /** Signer mode only, for a signed class; non-extractable. */
  privateKey: CryptoKey | null;
  /** Signer mode only: see `mintableAt`. */
  mintableAt: number | null;
}>;

export type KeySet = Readonly<{
  mode: KeySetMode;
  signedClasses: readonly TokenClass[];
  entries: readonly ParsedKeyEntry[];
  deniedKids: readonly string[];
}>;

export type DisableReason =
  | 'denied'
  | 'shape'
  | 'published_in_future'
  | 'retired_at'
  | 'not_after'
  | 'public_jwk'
  | 'private_jwk'
  | 'duplicate_kid'
  | 'active_conflict'
  | 'next_conflict';

export type DisabledEntry = Readonly<{
  index: number;
  kid: string | null;
  reason: DisableReason;
}>;

export type KeySetResult =
  | { ok: true; keySet: KeySet; disabled: readonly DisabledEntry[] }
  | { ok: false; reason: 'invalid_set' | 'options' };

export type ParseKeySetOptions =
  | { mode: 'verifier'; now: number }
  | {
      mode: 'signer';
      now: number;
      /** The classes this signer mints. */
      classes: readonly TokenClass[];
      observations?: ObservationCache;
      emergencyKids?: EmergencyKids;
    };

const ENTRY_MEMBERS = new Set([
  'kid',
  'class',
  'status',
  'publishedAt',
  'notBefore',
  'retiredAt',
  'notAfter',
  'publicJwk',
  'privateJwk',
]);
const STATUSES = new Set<string>(['next', 'active', 'retired']);

// Key sets parseKeySet returned. Minting accepts nothing else.
const parsedKeySets = new WeakSet<object>();

export function isParsedKeySet(value: unknown): value is KeySet {
  return (
    typeof value === 'object' && value !== null && parsedKeySets.has(value)
  );
}

/**
 * The exact `notAfter` of an entry: `notBefore + 90 days + maxLifetime + 1 day`,
 * and for a retired key the smaller of that and
 * `retiredAt + maxLifetime + 1 day`.
 */
export function expectedNotAfter(
  tokenClass: TokenClass,
  notBefore: number,
  retiredAt: number | null
): number {
  const tail = MAX_TOKEN_LIFETIME_SECONDS[tokenClass] + DAY_SECONDS;
  const full = notBefore + SIGNING_WINDOW_SECONDS + tail;
  return retiredAt === null ? full : Math.min(full, retiredAt + tail);
}

type Draft = Omit<
  ParsedKeyEntry,
  'thumbprint' | 'publicKey' | 'privateKey' | 'mintableAt'
> & { privateJwk: EcPrivateJwk | null };

type Readable = { kid: string; class: TokenClass; status: KeyStatus };

function readable(raw: unknown): Readable | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const { kid, class: keyClass, status } = raw as Record<string, unknown>;
  if (typeof kid !== 'string' || !KID_PATTERN.test(kid)) return null;
  if (!isTokenClass(keyClass) || typeof status !== 'string') return null;
  if (!STATUSES.has(status)) return null;
  return { kid, class: keyClass, status: status as KeyStatus };
}

/** Applies the per-entry rules that need no Web Crypto. */
function draftEntry(
  raw: Record<string, unknown>,
  head: Readable,
  options: ParseKeySetOptions
): Draft | DisableReason {
  if (Object.keys(raw).some((member) => !ENTRY_MEMBERS.has(member))) {
    return 'shape';
  }
  const { publishedAt, notBefore, notAfter } = raw;
  const retiredAt = raw.retiredAt ?? null;
  if (
    !isTimestamp(publishedAt) ||
    !isTimestamp(notBefore) ||
    !isTimestamp(notAfter) ||
    (retiredAt !== null && !isTimestamp(retiredAt))
  ) {
    return 'shape';
  }
  if (publishedAt > options.now) return 'published_in_future';
  if ((head.status === 'retired') !== (retiredAt !== null)) {
    return 'retired_at';
  }
  const expected = expectedNotAfter(head.class, notBefore, retiredAt);
  if (!Number.isSafeInteger(expected) || notAfter !== expected) {
    return 'not_after';
  }
  const publicJwk = readEcJwk(raw.publicJwk, false);
  if (!publicJwk) return 'public_jwk';
  let privateJwk: EcPrivateJwk | null = null;
  if (raw.privateJwk !== undefined) {
    if (options.mode === 'verifier' || head.status === 'retired') {
      return 'private_jwk';
    }
    const parsed = readEcJwk(raw.privateJwk, true) as EcPrivateJwk | null;
    if (!parsed || parsed.x !== publicJwk.x || parsed.y !== publicJwk.y) {
      return 'private_jwk';
    }
    // A signer holds private keys only for the classes it signs.
    privateJwk = options.classes.includes(head.class) ? parsed : null;
  }
  return {
    ...head,
    publishedAt,
    notBefore,
    retiredAt,
    notAfter,
    publicJwk,
    privateJwk,
  };
}

/** Imports a private key and proves it pairs with the entry's public key. */
async function importPrivateKey(
  jwk: EcPrivateJwk,
  publicKey: CryptoKey
): Promise<CryptoKey | null> {
  try {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const probe = utf8('ttr-key-pair-probe');
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      probe
    );
    const paired = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      probe
    );
    return paired ? privateKey : null;
  } catch {
    return null;
  }
}

function validOptions(options: ParseKeySetOptions): boolean {
  if (typeof options !== 'object' || options === null) return false;
  if (!isTimestamp(options.now)) return false;
  if (options.mode === 'verifier') return true;
  return (
    options.mode === 'signer' &&
    Array.isArray(options.classes) &&
    options.classes.every((value) => TOKEN_CLASSES.includes(value))
  );
}

/** Parses key-set JSON. It never throws. */
export async function parseKeySet(
  json: string,
  options: ParseKeySetOptions
): Promise<KeySetResult> {
  if (!validOptions(options)) return { ok: false, reason: 'options' };
  if (typeof json !== 'string' || json.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: 'invalid_set' };
  }
  const parsed = parseStrictJson(json);
  if (
    !isJsonObject(parsed) ||
    Object.keys(parsed).length !== 2 ||
    !Array.isArray(parsed.entries) ||
    !Array.isArray(parsed.deniedKids) ||
    !parsed.deniedKids.every(
      (kid) => typeof kid === 'string' && KID_PATTERN.test(kid)
    )
  ) {
    return { ok: false, reason: 'invalid_set' };
  }
  const deniedKids = [...new Set(parsed.deniedKids as string[])];
  const denied = new Set(deniedKids);
  const disabled: DisabledEntry[] = [];
  const disable = (index: number, kid: string | null, reason: DisableReason) =>
    disabled.push(Object.freeze({ index, kid, reason }));

  // Denial runs before every other rule, so a denied entry joins no conflict.
  const candidates: Array<{
    index: number;
    raw: unknown;
    head: Readable | null;
  }> = [];
  parsed.entries.forEach((raw, index) => {
    const head = readable(raw);
    if (head && denied.has(head.kid)) disable(index, head.kid, 'denied');
    else candidates.push({ index, raw, head });
  });

  const kidCount = new Map<string, number>();
  const activeCount = new Map<TokenClass, number>();
  const nextSignerCount = new Map<TokenClass, number>();
  const bump = <K>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1);
  for (const { raw, head } of candidates) {
    if (!head) continue;
    bump(kidCount, head.kid);
    if (head.status === 'active') bump(activeCount, head.class);
    const hasPrivate =
      (raw as Record<string, unknown>).privateJwk !== undefined;
    if (options.mode === 'signer' && head.status === 'next' && hasPrivate) {
      bump(nextSignerCount, head.class);
    }
  }

  const drafts: Array<{ index: number; draft: Draft }> = [];
  for (const { index, raw, head } of candidates) {
    if (!head) {
      disable(index, null, 'shape');
      continue;
    }
    const hasPrivate =
      (raw as Record<string, unknown>).privateJwk !== undefined;
    if ((kidCount.get(head.kid) ?? 0) > 1) {
      disable(index, head.kid, 'duplicate_kid');
    } else if (
      head.status === 'active' &&
      (activeCount.get(head.class) ?? 0) > 1
    ) {
      disable(index, head.kid, 'active_conflict');
    } else if (
      head.status === 'next' &&
      hasPrivate &&
      (nextSignerCount.get(head.class) ?? 0) > 1
    ) {
      disable(index, head.kid, 'next_conflict');
    } else {
      const draft = draftEntry(raw as Record<string, unknown>, head, options);
      if (typeof draft === 'string') disable(index, head.kid, draft);
      else drafts.push({ index, draft });
    }
  }

  const entries: ParsedKeyEntry[] = [];
  for (const { index, draft } of drafts) {
    const publicKey = await importPublicJwk(draft.publicJwk);
    if (!publicKey) {
      disable(index, draft.kid, 'public_jwk');
      continue;
    }
    let privateKey: CryptoKey | null = null;
    if (draft.privateJwk) {
      privateKey = await importPrivateKey(draft.privateJwk, publicKey);
      if (!privateKey) {
        disable(index, draft.kid, 'private_jwk');
        continue;
      }
    }
    const { privateJwk: _privateJwk, ...rest } = draft;
    const entry = {
      ...rest,
      publicJwk: Object.freeze({ ...draft.publicJwk }),
      thumbprint: await jwkThumbprint(draft.publicJwk),
      publicKey,
      privateKey,
      mintableAt: null as number | null,
    };
    if (options.mode === 'signer' && privateKey) {
      entry.mintableAt = mintableAt(entry, {
        observations: options.observations,
        emergencyKids: options.emergencyKids,
      });
    }
    entries.push(Object.freeze(entry));
  }

  const keySet: KeySet = Object.freeze({
    mode: options.mode,
    signedClasses: Object.freeze(
      options.mode === 'signer' ? [...new Set(options.classes)] : []
    ),
    entries: Object.freeze(entries),
    deniedKids: Object.freeze(deniedKids),
  });
  parsedKeySets.add(keySet);
  disabled.sort((left, right) => left.index - right.index);
  return { ok: true, keySet, disabled: Object.freeze(disabled) };
}
