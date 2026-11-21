/**
 * Mints tokens with the class's in-window `active` key only. Every mint
 * re-checks the claim profile, the minting time and publication against the
 * last census, and refuses instead of signing anything a verifier would
 * reject. `jti` bytes come from the injected random source.
 */
import { encodeBase64Url, type JsonValue, utf8 } from '../encoding';
import { checkClaims, deepFreeze } from '../token-claims';
import {
  type ClaimSet,
  isTokenClass,
  MAX_TOKEN_BYTES,
  TOKEN_TYPES,
  type TokenClass,
} from '../token-core';
import type { EmergencyKids } from './emergency';
import {
  isParsedKeySet,
  type KeySet,
  type ParsedKeyEntry,
  SIGNING_WINDOW_SECONDS,
} from './key-set';
import { mintableAt, type ObservationCache } from './observations';
import { PROFILES, type TokenClaims } from './profiles';
import {
  type PublicationCensus,
  publicationHolds,
  type VerifierRegistry,
} from './publication';

export type RandomSource = { bytes(length: number): Uint8Array };

export type MintClaims<C extends TokenClass> = Omit<
  TokenClaims[C],
  'iat' | 'jti'
>;

export type MintOptions = {
  keySet: KeySet;
  /** Committed observation rows the signer has cached. */
  observations: ObservationCache;
  emergencyKids: EmergencyKids | null;
  census: PublicationCensus | null;
  registry: VerifierRegistry;
  /** The minting Worker's own service identity, supplied by its host (s2s). */
  caller?: string;
  services?: readonly string[];
  scopes?: readonly string[];
  clients?: readonly string[];
  random: RandomSource;
  /** Current time in seconds. */
  now: () => number;
};

export type MintFailureReason =
  | 'class'
  | 'key_set'
  | 'no_active_key'
  | 'not_mintable'
  | 'not_published'
  | 'claims'
  | 'caller'
  | 'random'
  | 'signing';

export type MintResult<C extends TokenClass> =
  | {
      ok: true;
      token: string;
      kid: string;
      claims: Readonly<TokenClaims[C]>;
    }
  | { ok: false; reason: MintFailureReason };

const JTI_BYTES = 16;

/** Copies plain JSON data, rejecting anything a verifier could not parse back. */
function cloneJson(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 8) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0)
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) return undefined;
      const item = cloneJson(value[index], depth + 1);
      if (item === undefined) return undefined;
      result.push(item);
    }
    return result;
  }
  if (typeof value !== 'object') return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const result = Object.create(null) as { [key: string]: JsonValue };
  for (const key of Object.keys(value)) {
    const item = cloneJson((value as Record<string, unknown>)[key], depth + 1);
    if (item === undefined) return undefined;
    result[key] = item;
  }
  return result;
}

/** The class's single enabled `active` key that can sign, if any. */
function activeKey(
  keySet: KeySet,
  tokenClass: TokenClass
): ParsedKeyEntry | null {
  const active = keySet.entries.filter(
    (entry) => entry.class === tokenClass && entry.status === 'active'
  );
  const [entry] = active;
  return active.length === 1 && entry?.privateKey ? entry : null;
}

const refuse = <C extends TokenClass>(
  reason: MintFailureReason
): MintResult<C> => ({ ok: false, reason });

/**
 * Mints a token of `tokenClass`. `claims` carries every member except `iat`
 * and `jti`, which the signer sets. It never throws.
 */
export async function mintToken<C extends TokenClass>(
  tokenClass: C,
  claims: MintClaims<C>,
  options: MintOptions
): Promise<MintResult<C>> {
  if (!isTokenClass(tokenClass)) return refuse('class');
  const { keySet } = options;
  if (!isParsedKeySet(keySet) || keySet.mode !== 'signer') {
    return refuse('key_set');
  }
  if (!keySet.signedClasses.includes(tokenClass)) return refuse('class');
  const now = Math.floor(options.now());
  if (!Number.isSafeInteger(now) || now < 0) return refuse('not_mintable');

  const entry = activeKey(keySet, tokenClass);
  if (!entry || !entry.privateKey) return refuse('no_active_key');
  const earliest = mintableAt(entry, {
    observations: options.observations,
    emergencyKids: options.emergencyKids,
  });
  if (earliest === null) return refuse('not_published');
  const windowEnd = Math.min(
    entry.notBefore + SIGNING_WINDOW_SECONDS,
    entry.notAfter
  );
  if (now < earliest || now >= windowEnd) return refuse('not_mintable');
  if (
    !publicationHolds(entry, {
      registry: options.registry,
      census: options.census,
      now,
    })
  ) {
    return refuse('not_published');
  }

  const input = cloneJson(claims);
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    'iat' in input ||
    'jti' in input
  ) {
    return refuse('claims');
  }
  let jtiBytes: unknown;
  try {
    jtiBytes = options.random.bytes(JTI_BYTES);
  } catch {
    return refuse('random');
  }
  if (!(jtiBytes instanceof Uint8Array) || jtiBytes.length !== JTI_BYTES) {
    return refuse('random');
  }
  const payload: ClaimSet = {
    ...input,
    iat: now,
    jti: encodeBase64Url(jtiBytes),
  };
  const failure = checkClaims(
    PROFILES[tokenClass],
    payload,
    null,
    {
      mint: true,
      caller: options.caller,
      services: options.services,
      scopes: options.scopes,
      clients: options.clients,
    },
    now
  );
  if (failure === 'caller') return refuse('caller');
  if (failure) return refuse('claims');

  const header = JSON.stringify({
    alg: 'ES256',
    typ: TOKEN_TYPES[tokenClass],
    kid: entry.kid,
  });
  const signingInput = `${encodeBase64Url(utf8(header))}.${encodeBase64Url(utf8(JSON.stringify(payload)))}`;
  let signature: Uint8Array;
  try {
    signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        entry.privateKey,
        utf8(signingInput)
      )
    );
  } catch {
    return refuse('signing');
  }
  if (signature.length !== 64) return refuse('signing');
  const token = `${signingInput}.${encodeBase64Url(signature)}`;
  if (token.length > MAX_TOKEN_BYTES) return refuse('claims');
  return {
    ok: true,
    token,
    kid: entry.kid,
    claims: deepFreeze(payload) as unknown as TokenClaims[C],
  };
}
