/**
 * Test-only issuer for identity assertions. It generates an ephemeral P-256
 * key pair in memory per call, is never part of a package entry point, and
 * refuses to run outside a Vitest process, so a stray runtime import cannot
 * mint anything.
 */
import { encodeBase64Url, utf8 } from './encoding';
import type { KeySource } from './verify';

export const TEST_ISSUER = 'https://tuturuuu.test';
export const TEST_AUDIENCE = 'mount:tasks' as const;
export const TEST_USER_ID = '0b9d7a4e-5f3c-4c1a-9e2b-7d6f8a1c2b3e';

export type TestClaims = Record<string, unknown>;

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

export type TestIssuer = {
  kid: string;
  keys: KeySource;
  publicKey: CryptoKey;
  /** Signs raw header and payload JSON text, so tests can craft any input. */
  signRaw(headerJson: string, payloadJson: string): Promise<string>;
  sign(claims: TestClaims, header?: Record<string, unknown>): Promise<string>;
};

function assertTestRuntime(): void {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  if (env?.VITEST !== 'true') {
    throw new Error('The session test issuer runs only under Vitest');
  }
}

export async function createTestIssuer(
  kid = 'test-identity-1'
): Promise<TestIssuer> {
  assertTestRuntime();
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const signRaw = async (headerJson: string, payloadJson: string) => {
    const signingInput = `${encodeBase64Url(utf8(headerJson))}.${encodeBase64Url(utf8(payloadJson))}`;
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        utf8(signingInput)
      )
    );
    return `${signingInput}.${encodeBase64Url(signature)}`;
  };
  return {
    kid,
    publicKey: pair.publicKey,
    keys: { get: async (id) => (id === kid ? pair.publicKey : null) },
    signRaw,
    sign: (claims, header = { alg: 'ES256', typ: 'ttr+identity', kid }) =>
      signRaw(JSON.stringify(header), JSON.stringify(claims)),
  };
}
