/** Scenario builders for the token tests. Test-only by path. */
import { encodeBase64Url } from '../encoding';
import {
  generateTestKeyPair,
  TEST_ISSUER,
  TEST_USER_ID,
  type TestKeyPair,
} from '../testing';
import {
  ACCESS_AUDIENCE,
  buildCensus,
  type CensusInput,
  expectedNotAfter,
  jwksDocument,
  type KeyObservation,
  type KeySet,
  type KeySetResult,
  keySourceFromKeySet,
  type MintClaims,
  type MintOptions,
  NO_EMERGENCY_KIDS,
  type ObservationCache,
  observationKey,
  parseKeySet,
  type PublicationCensus,
  type RandomSource,
  TOKEN_CLASSES,
  type TokenClass,
  type VerifierRegistry,
  type VerifyTokenOptions,
} from '../tokens';

export const NOW = 1_800_000_000;
export const DAY = 86_400;
export const WORKSPACE_ID = '4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

export type KeySpec = {
  kid: string;
  class: TokenClass;
  status: 'next' | 'active' | 'retired';
  notBefore?: number;
  publishedAt?: number;
  retiredAt?: number;
  notAfter?: number;
  withPrivate?: boolean;
  pair?: TestKeyPair;
  extra?: Record<string, unknown>;
};

export type BuiltKey = { json: Record<string, unknown>; pair: TestKeyPair };

export async function keyEntry(spec: KeySpec): Promise<BuiltKey> {
  const pair = spec.pair ?? (await generateTestKeyPair());
  const notBefore = spec.notBefore ?? NOW - 10 * DAY;
  const retiredAt = spec.retiredAt ?? null;
  const json: Record<string, unknown> = {
    kid: spec.kid,
    class: spec.class,
    status: spec.status,
    publishedAt: spec.publishedAt ?? notBefore,
    notBefore,
    ...(retiredAt === null ? {} : { retiredAt }),
    notAfter:
      spec.notAfter ?? expectedNotAfter(spec.class, notBefore, retiredAt),
    publicJwk: pair.publicJwk,
    ...(spec.withPrivate ? { privateJwk: pair.privateJwk } : {}),
    ...spec.extra,
  };
  return { json, pair };
}

export const keySetJson = (
  entries: Array<Record<string, unknown>>,
  deniedKids: string[] = []
) => JSON.stringify({ entries, deniedKids });

/** Strips private keys, as a verifier configuration would. */
export const publicOnly = (entries: Array<Record<string, unknown>>) =>
  entries.map(({ privateJwk: _privateJwk, ...rest }) => rest);

type BaseVerify<C extends TokenClass> = Omit<
  VerifyTokenOptions<C>,
  'keys' | 'now'
>;

export const VERIFY: { [C in TokenClass]: BaseVerify<C> } = {
  identity: {
    issuer: TEST_ISSUER,
    environment: 'local',
    audience: 'mount:tasks',
  },
  stepup: {
    issuer: TEST_ISSUER,
    environment: 'local',
    audience: 'stepup:vault',
  },
  s2s: {
    issuer: TEST_ISSUER,
    environment: 'local',
    audience: 'service:billing',
    services: ['tasks-worker', 'billing'],
  },
  realtime: {
    issuer: TEST_ISSUER,
    environment: 'local',
    audience: 'realtime:meet',
    topic: { kind: 'meet', id: 'room-1' },
  },
  access: {
    issuer: TEST_ISSUER,
    environment: 'local',
    audience: ACCESS_AUDIENCE,
    scopes: ['tasks:read', 'tasks:write'],
    clients: ['cli'],
  },
};

const SID = 'AAAAAAAAAAAAAAAAAAAAAA';

/** Valid mint claims (no `iat` or `jti`) for each class at `now`. */
export function mintClaims<C extends TokenClass>(
  tokenClass: C,
  now = NOW
): MintClaims<C> {
  const base = { iss: TEST_ISSUER, env: 'local' as const };
  const byClass = {
    identity: {
      ...base,
      aud: 'mount:tasks',
      sub: TEST_USER_ID,
      sid: SID,
      gen: 3,
      src: 'cookie',
      stale: false,
      aal: 'aal2',
      amr: ['passkey'],
      auth_time: now - 120,
      exp: now + 60,
    },
    stepup: {
      ...base,
      aud: 'stepup:vault',
      sub: TEST_USER_ID,
      sid: SID,
      gen: 3,
      act: 'vault.pin-eval',
      ph: encodeBase64Url(new Uint8Array(32).fill(7)),
      nonce: encodeBase64Url(new Uint8Array(16).fill(9)),
      aal: 'aal2',
      amr: ['totp'],
      auth_time: now - 10,
      exp: now + 300,
    },
    s2s: {
      ...base,
      aud: 'service:billing',
      sub: 'tasks-worker',
      azp: 'tasks-worker',
      exp: now + 300,
    },
    realtime: {
      ...base,
      aud: 'realtime:meet',
      sub: TEST_USER_ID,
      sid: SID,
      gen: 3,
      topic: { kind: 'meet', id: 'room-1' },
      exp: now + 600,
    },
    access: {
      ...base,
      aud: ACCESS_AUDIENCE,
      sub: TEST_USER_ID,
      azp: 'cli',
      sid: SID,
      scope: 'tasks:read',
      ws: [WORKSPACE_ID],
      exp: now + 300,
    },
  };
  return byClass[tokenClass] as unknown as MintClaims<C>;
}

export function counterRandom(): RandomSource {
  let counter = 0;
  return {
    bytes: (length) => {
      counter += 1;
      return new Uint8Array(length).fill(counter % 256);
    },
  };
}

export const REGISTRY: VerifierRegistry = Object.fromEntries(
  TOKEN_CLASSES.map((tokenClass) => [tokenClass, [`${tokenClass}-a`]])
);

export function ok(result: KeySetResult): KeySet {
  if (!result.ok) throw new Error(`key set failed: ${result.reason}`);
  return result.keySet;
}

/** A census where every registered deployment of every class loaded `verifierJson`. */
export async function censusFor(
  verifierJson: string,
  jwksBody: string,
  input: Partial<CensusInput> = {},
  registry: VerifierRegistry = REGISTRY
): Promise<PublicationCensus> {
  const reports = Object.fromEntries(
    TOKEN_CLASSES.map((tokenClass) => [
      tokenClass,
      (registry[tokenClass] ?? []).map((deploymentId) => ({
        deploymentId,
        body: verifierJson,
      })),
    ])
  );
  return buildCensus({ takenAt: NOW, jwksBody, reports, ...input });
}

export function rowsFor(
  keySet: KeySet,
  publishedAt: number,
  bootstrap = false
): ObservationCache {
  const cache = new Map<string, KeyObservation>();
  for (const entry of keySet.entries) {
    const key = {
      class: entry.class,
      kid: entry.kid,
      thumbprint: entry.thumbprint,
    };
    cache.set(observationKey(key), { ...key, publishedAt, bootstrap });
  }
  return cache;
}

export type World = Awaited<ReturnType<typeof createWorld>>;

/**
 * One active signing key per class, published everywhere eight days ago,
 * with matching verifier key sets and a fresh census.
 */
export async function createWorld(
  classes: readonly TokenClass[] = TOKEN_CLASSES
) {
  const built = await Promise.all(
    classes.map((tokenClass) =>
      keyEntry({
        kid: `${tokenClass}-1`,
        class: tokenClass,
        status: 'active',
        withPrivate: true,
      })
    )
  );
  const entries = built.map((key) => key.json);
  const signerJson = keySetJson(entries);
  const verifierJson = keySetJson(publicOnly(entries));
  const signer = ok(
    await parseKeySet(signerJson, { mode: 'signer', now: NOW, classes })
  );
  const verifierResult = await parseKeySet(verifierJson, {
    mode: 'verifier',
    now: NOW,
  });
  const verifier = ok(verifierResult);
  const jwksBody = JSON.stringify(jwksDocument(verifier, NOW));
  const census = await censusFor(verifierJson, jwksBody);
  const observations = rowsFor(signer, NOW - 8 * DAY);
  const pairs = Object.fromEntries(
    classes.map((tokenClass, index) => [tokenClass, built[index]?.pair])
  ) as Record<TokenClass, TestKeyPair>;
  const mintOptions = (overrides: Partial<MintOptions> = {}): MintOptions => ({
    keySet: signer,
    observations,
    emergencyKids: NO_EMERGENCY_KIDS,
    census,
    registry: REGISTRY,
    caller: 'tasks-worker',
    services: ['tasks-worker', 'billing'],
    scopes: ['tasks:read', 'tasks:write'],
    clients: ['cli'],
    random: counterRandom(),
    now: () => NOW,
    ...overrides,
  });
  const verifyOptions = <C extends TokenClass>(
    tokenClass: C,
    overrides: Partial<VerifyTokenOptions<C>> = {}
  ): VerifyTokenOptions<C> =>
    ({
      ...VERIFY[tokenClass],
      keys: keySourceFromKeySet(verifierResult, tokenClass),
      now: () => NOW,
      ...overrides,
    }) as VerifyTokenOptions<C>;
  return {
    entries,
    pairs,
    signerJson,
    verifierJson,
    signer,
    verifier,
    verifierResult,
    jwksBody,
    census,
    observations,
    mintOptions,
    verifyOptions,
  };
}
