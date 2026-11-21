import { describe, expect, it } from 'vitest';
import {
  censusFor,
  createWorld,
  DAY,
  keyEntry,
  keySetJson,
  mintClaims,
  NOW,
  ok,
  publicOnly,
  REGISTRY,
  rowsFor,
} from '../__tests__/token-fixtures';
import { createFakeObservationStore } from '../testing';
import {
  EMPTY_OBSERVATIONS,
  jwksDocument,
  keySourceFromKeySet,
  type MintClaims,
  mintToken,
  parseEmergencyKids,
  parseKeySet,
  refreshObservations,
  TOKEN_CLASSES,
  type TokenClass,
  verifyToken,
} from '../tokens';

/** A world for one identity key whose verifier set and census are taken at `at`. */
async function identityAt(at: number, spec: Parameters<typeof keyEntry>[0]) {
  const key = await keyEntry(spec);
  const signerJson = keySetJson([key.json]);
  const verifierJson = keySetJson(publicOnly([key.json]));
  const signer = ok(
    await parseKeySet(signerJson, {
      mode: 'signer',
      now: at,
      classes: ['identity'],
    })
  );
  const verifier = ok(
    await parseKeySet(verifierJson, { mode: 'verifier', now: at })
  );
  const census = await censusFor(
    verifierJson,
    JSON.stringify(jwksDocument(verifier, at)),
    { takenAt: at }
  );
  return { key, signer, verifier, census };
}

describe('mintToken', () => {
  it.each(TOKEN_CLASSES)(
    'mints a %s token that verifies',
    async (tokenClass) => {
      const world = await createWorld();
      const minted = await mintToken(
        tokenClass,
        mintClaims(tokenClass),
        world.mintOptions()
      );
      if (!minted.ok) throw new Error(minted.reason);
      expect(minted.kid).toBe(`${tokenClass}-1`);
      expect(minted.claims.iat).toBe(NOW);
      const verified = await verifyToken(
        tokenClass,
        minted.token,
        world.verifyOptions(tokenClass)
      );
      expect(verified).toMatchObject({
        ok: true,
        token: { class: tokenClass },
      });
    }
  );

  it('pins the wait: mints at publishedAt + 604800, refuses at publishedAt + 604799', async () => {
    const world = await createWorld(['identity']);
    const run = (publishedAt: number) =>
      mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions({ observations: rowsFor(world.signer, publishedAt) })
      );
    expect((await run(NOW - 604_800)).ok).toBe(true);
    expect(await run(NOW - 604_799)).toEqual({
      ok: false,
      reason: 'not_mintable',
    });
  });

  it('ignores a backdated notBefore and a backdated configured publishedAt', async () => {
    const world = await identityAt(NOW, {
      kid: 'identity-1',
      class: 'identity',
      status: 'active',
      withPrivate: true,
      notBefore: NOW - 60 * DAY,
      publishedAt: NOW - 60 * DAY,
    });
    const minted = await mintToken('identity', mintClaims('identity'), {
      ...(await createWorld(['identity'])).mintOptions(),
      keySet: world.signer,
      census: world.census,
      observations: rowsFor(world.signer, NOW - DAY),
    });
    expect(minted).toEqual({ ok: false, reason: 'not_mintable' });
  });

  it('gives a reused kid with a new thumbprint its own row and wait', async () => {
    const old = await createWorld(['identity']);
    let clock = NOW - 30 * DAY;
    const store = createFakeObservationStore(() => clock);
    const first = await refreshObservations({
      keySet: old.signer,
      registry: REGISTRY,
      census: old.census,
      store,
      cache: EMPTY_OBSERVATIONS,
      now: NOW,
    });
    expect(first.size).toBe(1);

    const fresh = await createWorld(['identity']);
    expect(fresh.signer.entries[0]?.kid).toBe(old.signer.entries[0]?.kid);
    clock = NOW;
    const cache = await refreshObservations({
      keySet: fresh.signer,
      registry: REGISTRY,
      census: fresh.census,
      store,
      cache: first,
      now: NOW,
    });
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1]).toMatchObject({ publishedAt: NOW, bootstrap: false });
    const minted = await mintToken(
      'identity',
      mintClaims('identity'),
      fresh.mintOptions({ observations: cache })
    );
    expect(minted).toEqual({ ok: false, reason: 'not_mintable' });
  });

  it('refuses before both the served JWKS and every verifier set hold the key', async () => {
    const world = await createWorld(['identity']);
    const empty = keySetJson([]);
    const stale = JSON.stringify({ keys: [] });
    for (const census of [
      await censusFor(world.verifierJson, stale),
      await censusFor(empty, world.jwksBody),
    ]) {
      expect(
        await mintToken(
          'identity',
          mintClaims('identity'),
          world.mintOptions({ census })
        )
      ).toEqual({ ok: false, reason: 'not_published' });
    }
  });

  it('skips only the wait for the bootstrap key, still after publication', async () => {
    const world = await createWorld(['identity']);
    const store = createFakeObservationStore(() => NOW);
    const unpublished = await censusFor(keySetJson([]), world.jwksBody);
    const none = await refreshObservations({
      keySet: world.signer,
      registry: REGISTRY,
      census: unpublished,
      store,
      cache: EMPTY_OBSERVATIONS,
      now: NOW,
    });
    expect(none.size).toBe(0);
    const cache = await refreshObservations({
      keySet: world.signer,
      registry: REGISTRY,
      census: world.census,
      store,
      cache: EMPTY_OBSERVATIONS,
      now: NOW,
    });
    expect(store.rows[0]).toMatchObject({ bootstrap: true, publishedAt: NOW });
    expect(
      (
        await mintToken(
          'identity',
          mintClaims('identity'),
          world.mintOptions({ observations: cache })
        )
      ).ok
    ).toBe(true);
    expect(
      await mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions({ observations: cache, census: unpublished })
      )
    ).toEqual({ ok: false, reason: 'not_published' });
  });

  it('skips only the wait for an armed emergency active key', async () => {
    const world = await createWorld(['identity', 's2s']);
    const fresh = rowsFor(world.signer, NOW);
    const armed = parseEmergencyKids(
      JSON.stringify([
        { class: 'identity', kid: 'unknown' },
        { class: 's2s', kid: 's2s-1' },
        { class: 's2s', kid: 'second' },
        { class: 'nope', kid: 'x' },
      ])
    );
    expect(armed.armed).toEqual({
      identity: ['unknown'],
      s2s: ['s2s-1', 'second'],
    });
    expect(
      (
        await mintToken(
          's2s',
          mintClaims('s2s'),
          world.mintOptions({ observations: fresh, emergencyKids: armed })
        )
      ).ok
    ).toBe(true);
    expect(
      await mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions({ observations: fresh, emergencyKids: armed })
      )
    ).toEqual({ ok: false, reason: 'not_mintable' });
    const unpublished = await censusFor(keySetJson([]), world.jwksBody);
    expect(
      await mintToken(
        's2s',
        mintClaims('s2s'),
        world.mintOptions({
          observations: fresh,
          emergencyKids: armed,
          census: unpublished,
        })
      )
    ).toEqual({ ok: false, reason: 'not_published' });
    const wrongClass = parseEmergencyKids(
      JSON.stringify([{ class: 'identity', kid: 's2s-1' }])
    );
    expect(
      await mintToken(
        's2s',
        mintClaims('s2s'),
        world.mintOptions({ observations: fresh, emergencyKids: wrongClass })
      )
    ).toEqual({ ok: false, reason: 'not_mintable' });
  });

  it('arms the active key even when a bad listing for its class comes first', async () => {
    const world = await createWorld(['identity']);
    const fresh = rowsFor(world.signer, NOW);
    const armed = parseEmergencyKids(
      JSON.stringify([
        { class: 'identity', kid: 'typo' },
        { class: 'identity', kid: 'identity-1' },
      ])
    );
    expect(
      (
        await mintToken(
          'identity',
          mintClaims('identity'),
          world.mintOptions({ observations: fresh, emergencyKids: armed })
        )
      ).ok
    ).toBe(true);
  });

  it('signs bytes that a polluted prototype toJSON cannot change', async () => {
    const world = await createWorld(['access']);
    const objectProto = Object.prototype as { toJSON?: unknown };
    const arrayProto = Array.prototype as { toJSON?: unknown };
    objectProto.toJSON = () => ({ sub: 'attacker' });
    arrayProto.toJSON = () => ['attacker'];
    let result: Awaited<ReturnType<typeof mintToken>>;
    try {
      result = await mintToken(
        'access',
        mintClaims('access'),
        world.mintOptions()
      );
    } finally {
      delete objectProto.toJSON;
      delete arrayProto.toJSON;
    }
    if (!result.ok) throw new Error(result.reason);
    const [header, payload] = result.token.split('.');
    const decode = (part = '') =>
      JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(header).kid).toBe(result.kid);
    expect(decode(payload)).toEqual(JSON.parse(JSON.stringify(result.claims)));
    expect(decode(payload).sub).toBe(mintClaims('access').sub);
  });

  it('ignores an armed next key and never mints with one', async () => {
    const next = await keyEntry({
      kid: 'next-1',
      class: 'identity',
      status: 'next',
      withPrivate: true,
    });
    const json = keySetJson([next.json]);
    const signer = ok(
      await parseKeySet(json, {
        mode: 'signer',
        now: NOW,
        classes: ['identity'],
      })
    );
    const world = await createWorld(['identity']);
    expect(
      await mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions({
          keySet: signer,
          observations: rowsFor(signer, NOW - 30 * DAY, true),
          emergencyKids: parseEmergencyKids(
            JSON.stringify([{ class: 'identity', kid: 'next-1' }])
          ),
        })
      )
    ).toEqual({ ok: false, reason: 'no_active_key' });
  });

  it('keeps minting from cached committed rows during a store outage and stops on a cold start', async () => {
    const world = await createWorld(['identity']);
    const store = createFakeObservationStore(() => NOW);
    store.failing = true;
    const kept = await refreshObservations({
      keySet: world.signer,
      registry: REGISTRY,
      census: world.census,
      store,
      cache: world.observations,
      now: NOW,
    });
    expect(store.calls).toBe(0);
    expect(
      (
        await mintToken(
          'identity',
          mintClaims('identity'),
          world.mintOptions({ observations: kept })
        )
      ).ok
    ).toBe(true);
    const cold = await refreshObservations({
      keySet: world.signer,
      registry: REGISTRY,
      census: world.census,
      store,
      cache: EMPTY_OBSERVATIONS,
      now: NOW,
    });
    expect(store.calls).toBe(1);
    expect(cold.size).toBe(0);
    expect(
      await mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions({ observations: cold })
      )
    ).toEqual({ ok: false, reason: 'not_published' });
  });

  it('a verifier set without the kid rejects a token signed after the wait', async () => {
    const world = await createWorld(['identity']);
    const minted = await mintToken(
      'identity',
      mintClaims('identity'),
      world.mintOptions()
    );
    if (!minted.ok) throw new Error(minted.reason);
    const without = await parseKeySet(keySetJson([]), {
      mode: 'verifier',
      now: NOW,
    });
    expect(
      await verifyToken(
        'identity',
        minted.token,
        world.verifyOptions('identity', {
          keys: keySourceFromKeySet(without, 'identity'),
        })
      )
    ).toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('refuses past 90 days of signing and mints just before', async () => {
    for (const [at, expected] of [
      [NOW, false],
      [NOW - 1, true],
    ] as const) {
      const world = await identityAt(at, {
        kid: 'identity-1',
        class: 'identity',
        status: 'active',
        withPrivate: true,
        notBefore: NOW - 90 * DAY,
      });
      const result = await mintToken('identity', mintClaims('identity', at), {
        ...(await createWorld(['identity'])).mintOptions(),
        keySet: world.signer,
        census: world.census,
        observations: rowsFor(world.signer, NOW - 89 * DAY),
        now: () => at,
      });
      expect(result.ok, String(at)).toBe(expected);
    }
  });

  it('refuses an unparsed or verifier key set and an unsigned class', async () => {
    const world = await createWorld(['identity']);
    const claims = mintClaims('identity');
    expect(
      await mintToken(
        'identity',
        claims,
        world.mintOptions({ keySet: { ...world.signer } })
      )
    ).toEqual({ ok: false, reason: 'key_set' });
    expect(
      await mintToken(
        'identity',
        claims,
        world.mintOptions({ keySet: world.verifier })
      )
    ).toEqual({ ok: false, reason: 'key_set' });
    expect(
      await mintToken('access', mintClaims('access'), world.mintOptions())
    ).toEqual({ ok: false, reason: 'class' });
  });
});

describe('mintToken claim profiles', () => {
  const refusal = async <C extends TokenClass>(
    tokenClass: C,
    patch: Record<string, unknown>,
    overrides = {}
  ) => {
    const world = await createWorld([tokenClass]);
    const result = await mintToken(
      tokenClass,
      { ...mintClaims(tokenClass), ...patch } as MintClaims<C>,
      world.mintOptions(overrides)
    );
    return result.ok ? 'ok' : result.reason;
  };

  it.each([
    ['identity', { iat: NOW }],
    ['identity', { jti: 'BBBBBBBBBBBBBBBBBBBBBA' }],
    ['identity', { extra: 1 }],
    ['identity', { sub: 'not-a-uuid' }],
    ['identity', { aud: 'mount:Tasks' }],
    ['identity', { exp: NOW + 61 }],
    ['stepup', { amr: ['pwd'] }],
    ['stepup', { auth_time: NOW - 301 }],
    ['s2s', { sid: 'AAAAAAAAAAAAAAAAAAAAAA' }],
    ['realtime', { topic: { kind: 'channel', id: 'c' }, exp: NOW + 61 }],
    ['realtime', { exp: NOW + 601 }],
    ['realtime', { topic: { kind: 'meet', id: 'r', extra: 1 } }],
    ['realtime', { topic: { kind: 'meet', id: 'x'.repeat(129) } }],
    ['access', { ws: undefined }],
    ['access', { scope: 'tasks:admin' }],
    ['access', { scope: 'tasks:read tasks:read' }],
    ['access', { azp: 'unknown-client' }],
    ['access', { ws: Array(65).fill('4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f') }],
    [
      'access',
      {
        ws: [
          '4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
          '4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
        ],
      },
    ],
  ] as const)('refuses %s claims %j', async (tokenClass, patch) => {
    expect(await refusal(tokenClass, patch)).toBe('claims');
  });

  it('accepts 64 distinct workspace ids', async () => {
    const ws = Array.from(
      { length: 64 },
      (_, index) =>
        `4f1c2d3e-5a6b-4c7d-8e9f-${index.toString(16).padStart(12, '0')}`
    );
    expect(await refusal('access', { ws })).toBe('ok');
  });

  it('accepts realtime at its per-kind cap and an empty workspace list', async () => {
    expect(
      await refusal('realtime', {
        topic: { kind: 'channel', id: 'c' },
        exp: NOW + 60,
      })
    ).toBe('ok');
    expect(await refusal('realtime', { exp: NOW + 600 })).toBe('ok');
    expect(await refusal('access', { ws: [] })).toBe('ok');
  });

  it.each([
    [{ sub: 'billing' }],
    [{ azp: 'billing' }],
    [{ sub: 'billing', azp: 'billing' }],
  ])(
    'refuses an s2s token whose sub or azp is not the caller: %j',
    async (patch) => {
      expect(await refusal('s2s', patch)).toBe('caller');
    }
  );

  it('refuses an s2s caller missing from the service registry', async () => {
    expect(
      await refusal(
        's2s',
        { sub: 'reports', azp: 'reports' },
        { caller: 'reports' }
      )
    ).toBe('claims');
  });

  it('refuses a bad random source', async () => {
    for (const random of [
      { bytes: () => new Uint8Array(15) },
      { bytes: () => [1, 2] as unknown as Uint8Array },
      {
        bytes: () => {
          throw new Error('no entropy');
        },
      },
    ]) {
      expect(await refusal('identity', {}, { random })).toBe('random');
    }
  });
});
