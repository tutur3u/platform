import { describe, expect, it } from 'vitest';
import {
  censusFor,
  createWorld,
  keyEntry,
  keySetJson,
  NOW,
  publicOnly,
  REGISTRY,
} from '../__tests__/token-fixtures';
import { createFakeObservationStore } from '../testing';
import {
  buildCensus,
  EMPTY_OBSERVATIONS,
  jwksDocument,
  type KeyObservationStore,
  MAX_CENSUS_AGE_SECONDS,
  publicationHolds,
  refreshObservations,
  type TokenClass,
} from '../tokens';

const registryWith = (tokenClass: TokenClass, ids: string[]) => ({
  ...REGISTRY,
  [tokenClass]: ids,
});

describe('publicationHolds', () => {
  it('holds when every registered deployment and the served JWKS report the key', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    expect(
      publicationHolds(entry, {
        registry: REGISTRY,
        census: world.census,
        now: NOW,
      })
    ).toBe(true);
  });

  it('caps the census age at 300 seconds and rejects a census from the future', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    expect(MAX_CENSUS_AGE_SECONDS).toBe(300);
    const holds = (now: number) =>
      publicationHolds(entry, {
        registry: REGISTRY,
        census: world.census,
        now,
      });
    expect(holds(NOW + 300)).toBe(true);
    expect(holds(NOW + 301)).toBe(false);
    expect(holds(NOW - 1)).toBe(false);
  });

  it('is false for an empty registry, a missing class and an empty report list', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    const run = (registry: object, census = world.census) =>
      publicationHolds(entry, { registry, census, now: NOW });
    expect(run(registryWith('identity', []))).toBe(false);
    expect(run({ s2s: ['s2s-a'] })).toBe(false);
    expect(run(registryWith('identity', ['identity-a', 'identity-a']))).toBe(
      false
    );
    const noReports = await buildCensus({
      takenAt: NOW,
      jwksBody: world.jwksBody,
      reports: { identity: [] },
    });
    expect(run(REGISTRY, noReports)).toBe(false);
  });

  it('is false for two of three deployments, an extra report and a duplicate report', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    const three = registryWith('identity', ['a', 'b', 'c']);
    const body = world.verifierJson;
    const run = async (ids: string[], registry = three) =>
      publicationHolds(entry, {
        registry,
        census: await buildCensus({
          takenAt: NOW,
          jwksBody: world.jwksBody,
          reports: {
            identity: ids.map((deploymentId) => ({ deploymentId, body })),
          },
        }),
        now: NOW,
      });
    expect(await run(['a', 'b', 'c'])).toBe(true);
    expect(await run(['a', 'b'])).toBe(false);
    expect(await run(['a', 'b', 'c', 'd'])).toBe(false);
    expect(await run(['a', 'b', 'b'])).toBe(false);
    expect(await run(['a', 'b', 'x'])).toBe(false);
  });

  it('is false when one deployment did not load the key', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    const census = await buildCensus({
      takenAt: NOW,
      jwksBody: world.jwksBody,
      reports: {
        identity: [
          { deploymentId: 'a', body: world.verifierJson },
          { deploymentId: 'b', body: keySetJson([]) },
        ],
      },
    });
    expect(
      publicationHolds(entry, {
        registry: registryWith('identity', ['a', 'b']),
        census,
        now: NOW,
      })
    ).toBe(false);
  });

  it('is false when only jwksDocument() output contains the key, not the served JWKS', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    expect(
      jwksDocument(world.signer, NOW).keys.map((key) => key.kid)
    ).toContain(entry.kid);
    const census = await censusFor(
      world.verifierJson,
      JSON.stringify({ keys: [] })
    );
    expect(
      publicationHolds(entry, { registry: REGISTRY, census, now: NOW })
    ).toBe(false);
    const objectJwks = await buildCensus({
      takenAt: NOW,
      jwksBody: jwksDocument(world.signer, NOW) as unknown as string,
      reports: {
        identity: [{ deploymentId: 'identity-a', body: world.verifierJson }],
      },
    });
    expect(
      publicationHolds(entry, {
        registry: REGISTRY,
        census: objectJwks,
        now: NOW,
      })
    ).toBe(false);
  });

  it('recomputes thumbprints: a same-kid key elsewhere does not count', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    const impostor = await keyEntry({
      kid: entry.kid,
      class: 'identity',
      status: 'active',
    });
    const impostorJson = keySetJson(publicOnly([impostor.json]));
    const census = await censusFor(impostorJson, world.jwksBody);
    expect(
      publicationHolds(entry, { registry: REGISTRY, census, now: NOW })
    ).toBe(false);
    const forgedJwks = JSON.stringify({
      keys: jwksDocument(world.verifier, NOW).keys.map((key) => ({
        ...key,
        x: impostor.pair.publicJwk.x,
        y: impostor.pair.publicJwk.y,
      })),
    });
    const forged = await censusFor(world.verifierJson, forgedJwks);
    expect(
      publicationHolds(entry, { registry: REGISTRY, census: forged, now: NOW })
    ).toBe(false);
  });

  it('accepts only censuses that buildCensus reduced', async () => {
    const world = await createWorld(['identity']);
    const entry = world.signer.entries[0];
    if (!entry) throw new Error('no entry');
    expect(
      publicationHolds(entry, {
        registry: REGISTRY,
        census: { ...world.census },
        now: NOW,
      })
    ).toBe(false);
    expect(
      publicationHolds(entry, { registry: REGISTRY, census: null, now: NOW })
    ).toBe(false);
  });
});

describe('refreshObservations', () => {
  it('inserts a row only once publication holds, stamped by the store', async () => {
    const world = await createWorld(['identity']);
    const store = createFakeObservationStore(() => NOW - 5);
    const run = (census = world.census, cache = EMPTY_OBSERVATIONS) =>
      refreshObservations({
        keySet: world.signer,
        registry: REGISTRY,
        census,
        store,
        cache,
        now: NOW,
      });
    expect(
      (await run(await censusFor(keySetJson([]), world.jwksBody))).size
    ).toBe(0);
    expect(store.calls).toBe(0);
    const cache = await run();
    expect([...cache.values()]).toEqual([
      expect.objectContaining({
        kid: 'identity-1',
        publishedAt: NOW - 5,
        bootstrap: true,
      }),
    ]);
    await run(world.census, cache);
    expect(store.calls).toBe(1);
  });

  it('ignores a thrown error and a row that does not match the key', async () => {
    const world = await createWorld(['identity']);
    const throwing: KeyObservationStore = {
      getOrCreate: async () => {
        throw new Error('down');
      },
    };
    const wrong: KeyObservationStore = {
      getOrCreate: async (key) => ({
        ...key,
        kid: 'other',
        publishedAt: NOW - 30 * 86_400,
        bootstrap: true,
      }),
    };
    for (const store of [throwing, wrong]) {
      const cache = await refreshObservations({
        keySet: world.signer,
        registry: REGISTRY,
        census: world.census,
        store,
        cache: EMPTY_OBSERVATIONS,
        now: NOW,
      });
      expect(cache.size).toBe(0);
    }
  });
});
