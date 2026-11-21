/**
 * Test-only issuer and fakes for session tokens. Keys are ephemeral P-256
 * pairs generated in memory per call. This module is never part of a package
 * entry point, and every helper refuses to run outside a Vitest process, so a
 * stray runtime import cannot mint anything. The bare-`CryptoKey` adapter
 * exists only here.
 */
import { encodeBase64Url, utf8 } from './encoding';
import {
  isTimestamp,
  isTokenClass,
  type KeySource,
  TOKEN_TYPES,
  type TokenClass,
} from './token-core';
import type {
  KeyObservation,
  KeyObservationStore,
  ObservedKey,
} from './tokens/observations';
import type { EcPrivateJwk, EcPublicJwk } from './tokens/thumbprint';

export const TEST_ISSUER = 'https://tuturuuu.test';
export const TEST_AUDIENCE = 'mount:tasks' as const;
export const TEST_USER_ID = '0b9d7a4e-5f3c-4c1a-9e2b-7d6f8a1c2b3e';

/** A finite key lifetime around the tests' fixed clock (1 800 000 000). */
export const TEST_KEY_LIFETIME: TestKeyLifetime = Object.freeze({
  class: 'identity',
  notBefore: 1_799_000_000,
  notAfter: 1_801_000_000,
});

export type TestClaims = Record<string, unknown>;

export type TestKeyLifetime = Readonly<{
  class: TokenClass;
  notBefore: number;
  notAfter: number;
}>;

export function defaultTestClaims(nowSeconds: number): TestClaims {
  return {
    iss: TEST_ISSUER,
    env: 'local',
    aud: TEST_AUDIENCE,
    sub: TEST_USER_ID,
    sid: 'AAAAAAAAAAAAAAAAAAAAAA',
    gen: 3,
    src: 'cookie',
    stale: false,
    aal: 'aal2',
    amr: ['passkey'],
    auth_time: nowSeconds - 120,
    iat: nowSeconds,
    exp: nowSeconds + 60,
    jti: 'BBBBBBBBBBBBBBBBBBBBBA',
  };
}

function assertTestRuntime(): void {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  if (env?.VITEST !== 'true') {
    throw new Error('The session test issuer runs only under Vitest');
  }
}

/**
 * Adapts one bare key to the metadata lookup. The lifetime is explicit and
 * finite: there is no open default. `key` is unchecked so tests can pass
 * hostile objects.
 */
export function bareKeySource(
  kid: string,
  key: unknown,
  lifetime: TestKeyLifetime
): KeySource {
  assertTestRuntime();
  if (
    !isTokenClass(lifetime?.class) ||
    !isTimestamp(lifetime.notBefore) ||
    !isTimestamp(lifetime.notAfter)
  ) {
    throw new TypeError('bareKeySource needs an explicit finite lifetime');
  }
  const record = Object.freeze({
    key: key as CryptoKey,
    class: lifetime.class,
    notBefore: lifetime.notBefore,
    notAfter: lifetime.notAfter,
  });
  return { get: async (id) => (id === kid ? record : null) };
}

/** Signs raw header and payload JSON text with a private key. */
export async function signCompact(
  privateKey: CryptoKey,
  headerJson: string,
  payloadJson: string
): Promise<string> {
  assertTestRuntime();
  const signingInput = `${encodeBase64Url(utf8(headerJson))}.${encodeBase64Url(utf8(payloadJson))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      utf8(signingInput)
    )
  );
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

export type TestIssuer = {
  kid: string;
  keys: KeySource;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** Signs raw header and payload JSON text, so tests can craft any input. */
  signRaw(headerJson: string, payloadJson: string): Promise<string>;
  sign(claims: TestClaims, header?: Record<string, unknown>): Promise<string>;
};

export async function createTestIssuer(
  kid = 'test-identity-1',
  lifetime: TestKeyLifetime = TEST_KEY_LIFETIME
): Promise<TestIssuer> {
  assertTestRuntime();
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const signRaw = (headerJson: string, payloadJson: string) =>
    signCompact(pair.privateKey, headerJson, payloadJson);
  return {
    kid,
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    keys: bareKeySource(kid, pair.publicKey, lifetime),
    signRaw,
    sign: (
      claims,
      header = { alg: 'ES256', typ: TOKEN_TYPES[lifetime.class], kid }
    ) => signRaw(JSON.stringify(header), JSON.stringify(claims)),
  };
}

export type TestKeyPair = {
  publicJwk: EcPublicJwk;
  privateJwk: EcPrivateJwk;
  privateKey: CryptoKey;
};

/** An ephemeral P-256 pair exported as the closed JWKs a key set carries. */
export async function generateTestKeyPair(): Promise<TestKeyPair> {
  assertTestRuntime();
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    pair.privateKey
  )) as JsonWebKey;
  const publicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x as string,
    y: jwk.y as string,
  } as const;
  return {
    publicJwk,
    privateJwk: { ...publicJwk, d: jwk.d as string },
    privateKey: pair.privateKey,
  };
}

export type FakeObservationStore = KeyObservationStore & {
  rows: KeyObservation[];
  calls: number;
  /** While true, every call fails with `unavailable`. */
  failing: boolean;
};

/** An in-memory insert-only store stamped by the given clock. */
export function createFakeObservationStore(
  clock: () => number
): FakeObservationStore {
  assertTestRuntime();
  const store: FakeObservationStore = {
    rows: [],
    calls: 0,
    failing: false,
    async getOrCreate(key: ObservedKey) {
      store.calls += 1;
      if (store.failing) return 'unavailable';
      const existing = store.rows.find(
        (row) =>
          row.class === key.class &&
          row.kid === key.kid &&
          row.thumbprint === key.thumbprint
      );
      if (existing) return existing;
      const row = Object.freeze({
        class: key.class,
        kid: key.kid,
        thumbprint: key.thumbprint,
        publishedAt: clock(),
        bootstrap: !store.rows.some((other) => other.class === key.class),
      });
      store.rows.push(row);
      return row;
    },
  };
  return store;
}
