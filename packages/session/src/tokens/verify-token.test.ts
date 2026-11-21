import { describe, expect, it } from 'vitest';
import {
  createWorld,
  mintClaims,
  NOW,
  type World,
} from '../__tests__/token-fixtures';
import { signCompact } from '../testing';
import {
  type KeySource,
  keySourceFromKeySet,
  mintToken,
  TOKEN_CLASSES,
  TOKEN_TYPES,
  type TokenClass,
  verifyToken,
  type VerifyTokenOptions,
} from '../tokens';

const JTI = 'BBBBBBBBBBBBBBBBBBBBBA';

/** Signs claims with `keyClass`'s key, under `typClass`'s header type. */
function signAs(
  world: World,
  keyClass: TokenClass,
  claims: Record<string, unknown>,
  typClass: TokenClass = keyClass
) {
  const header = JSON.stringify({
    alg: 'ES256',
    typ: TOKEN_TYPES[typClass],
    kid: `${keyClass}-1`,
  });
  return signCompact(
    world.pairs[keyClass].privateKey,
    header,
    JSON.stringify(claims)
  );
}

const fullClaims = (
  tokenClass: TokenClass,
  patch: Record<string, unknown> = {}
) => {
  const claims: Record<string, unknown> = {
    ...mintClaims(tokenClass),
    iat: NOW,
    jti: JTI,
    ...patch,
  };
  for (const [key, value] of Object.entries(claims)) {
    if (value === undefined) delete claims[key];
  }
  return claims;
};

async function reason<C extends TokenClass>(
  world: World,
  tokenClass: C,
  patch: Record<string, unknown>,
  overrides: Partial<VerifyTokenOptions<C>> = {}
) {
  const token = await signAs(world, tokenClass, fullClaims(tokenClass, patch));
  const result = await verifyToken(
    tokenClass,
    token,
    world.verifyOptions(tokenClass, overrides)
  );
  return result.ok ? 'ok' : result.reason;
}

const PAIRS = TOKEN_CLASSES.flatMap((left) =>
  TOKEN_CLASSES.filter((right) => right !== left).map(
    (right) => [left, right] as const
  )
);

describe('cross-class rejection', () => {
  it.each(PAIRS)(
    'a minted %s token is rejected as %s',
    async (minted, expected) => {
      const world = await createWorld();
      const result = await mintToken(
        minted,
        mintClaims(minted),
        world.mintOptions()
      );
      if (!result.ok) throw new Error(result.reason);
      expect(
        await verifyToken(expected, result.token, world.verifyOptions(expected))
      ).toEqual({ ok: false, reason: 'type' });
    }
  );

  it.each(PAIRS)(
    'a %s key cannot sign a %s token',
    async (keyClass, tokenClass) => {
      const world = await createWorld();
      const token = await signAs(
        world,
        keyClass,
        fullClaims(tokenClass),
        tokenClass
      );
      // Both the class-scoped key source and a lookup that leaks the other class fail.
      const leaky: KeySource = {
        get: (kid) =>
          keySourceFromKeySet(world.verifierResult, keyClass).get(kid),
      };
      for (const keys of [world.verifyOptions(tokenClass).keys, leaky]) {
        expect(
          await verifyToken(
            tokenClass,
            token,
            world.verifyOptions(tokenClass, { keys })
          )
        ).toEqual({ ok: false, reason: 'unknown_key' });
      }
    }
  );
});

describe('expected values', () => {
  it.each(TOKEN_CLASSES)(
    'binds %s to the issuer, environment and audience',
    async (tokenClass) => {
      const world = await createWorld([tokenClass]);
      expect(
        await reason(world, tokenClass, { iss: 'https://evil.test' })
      ).toBe('issuer');
      expect(await reason(world, tokenClass, { env: 'production' })).toBe(
        'environment'
      );
      expect(await reason(world, tokenClass, { env: 'prod' })).toBe('claims');
      expect(
        await reason(world, tokenClass, {}, { issuer: 'https://other.test' })
      ).toBe('issuer');
      expect(
        await reason(world, tokenClass, {}, { environment: 'staging' })
      ).toBe('environment');
    }
  );

  it.each([
    ['identity', 'mount:finance', 'mount:Tasks'],
    ['stepup', 'stepup:other', 'service:vault'],
    ['s2s', 'service:other', 'mount:billing'],
    ['realtime', 'realtime:chat', 'realtime:'],
    ['access', 'https://tuturuuu.com/api/', 'https://evil.test/api'],
  ] as const)(
    'rejects a wrong %s audience both ways and a configured audience of the wrong shape',
    async (tokenClass, other, malformed) => {
      const world = await createWorld([tokenClass]);
      expect(await reason(world, tokenClass, { aud: other })).toBe('audience');
      expect(
        await reason(world, tokenClass, {
          aud: [world.verifyOptions(tokenClass).audience],
        })
      ).toBe('audience');
      if (tokenClass !== 'access') {
        expect(
          await reason(world, tokenClass, { aud: other }, {
            audience: other,
          } as never)
        ).toBe('ok');
      }
      expect(
        await reason(world, tokenClass, {}, { audience: malformed } as never)
      ).toBe('audience');
    }
  );

  it('binds the realtime topic in both directions', async () => {
    const world = await createWorld(['realtime']);
    expect(
      await reason(
        world,
        'realtime',
        {},
        { topic: { kind: 'meet', id: 'room-2' } }
      )
    ).toBe('topic');
    expect(
      await reason(world, 'realtime', { topic: { kind: 'meet', id: 'room-2' } })
    ).toBe('topic');
    expect(
      await reason(
        world,
        'realtime',
        {},
        { topic: { kind: 'chat', id: 'room-1' } }
      )
    ).toBe('topic');
    expect(
      await reason(world, 'realtime', {}, { topic: undefined as never })
    ).toBe('topic');
  });
});

describe('registries', () => {
  it('rejects an unregistered scope, client and service, and a missing registry', async () => {
    const world = await createWorld(['access', 's2s']);
    expect(await reason(world, 'access', { scope: 'tasks:admin' })).toBe(
      'claims'
    );
    expect(await reason(world, 'access', {}, { scopes: [] })).toBe('claims');
    expect(await reason(world, 'access', { azp: 'other' })).toBe('claims');
    expect(
      await reason(world, 'access', {}, { clients: undefined as never })
    ).toBe('claims');
    expect(await reason(world, 's2s', {}, { services: ['billing'] })).toBe(
      'claims'
    );
    expect(
      await reason(world, 'access', { scope: 'tasks:read tasks:write' })
    ).toBe('ok');
  });

  it('rejects an s2s token whose sub and azp differ', async () => {
    const world = await createWorld(['s2s']);
    expect(await reason(world, 's2s', { azp: 'billing' })).toBe('claims');
    expect(await reason(world, 's2s', { sub: 'billing', azp: 'billing' })).toBe(
      'ok'
    );
  });
});

describe('member types and closed sets', () => {
  it.each(TOKEN_CLASSES)(
    'rejects a malformed jti, a missing member and an unknown member for %s',
    async (tokenClass) => {
      const world = await createWorld([tokenClass]);
      expect(
        await reason(world, tokenClass, { jti: 'AAAAAAAAAAAAAAAAAAAAAB' })
      ).toBe('claims');
      expect(await reason(world, tokenClass, { jti: 'short' })).toBe('claims');
      expect(await reason(world, tokenClass, { exp: undefined })).toBe(
        'claims'
      );
      expect(await reason(world, tokenClass, { extra: true })).toBe('claims');
      expect(await reason(world, tokenClass, {})).toBe('ok');
    }
  );

  it.each(['identity', 'stepup', 'realtime', 'access'] as const)(
    'rejects a non-canonical user sub for %s',
    async (tokenClass) => {
      const world = await createWorld([tokenClass]);
      expect(
        await reason(world, tokenClass, {
          sub: '0B9D7A4E-5F3C-4C1A-9E2B-7D6F8A1C2B3E',
        })
      ).toBe('claims');
      expect(await reason(world, tokenClass, { sub: 'tasks-worker' })).toBe(
        'claims'
      );
    }
  );

  it('rejects an s2s sub that is not a service name, and a sid on s2s', async () => {
    const world = await createWorld(['s2s']);
    const uuid = '0b9d7a4e-5f3c-4c1a-9e2b-7d6f8a1c2b3e';
    expect(await reason(world, 's2s', { sub: uuid, azp: uuid })).toBe('claims');
    expect(await reason(world, 's2s', { sid: 'AAAAAAAAAAAAAAAAAAAAAA' })).toBe(
      'claims'
    );
  });

  it('enforces realtime caps by topic kind and a closed topic', async () => {
    const world = await createWorld(['realtime']);
    const channel = { kind: 'channel', id: 'room-1' } as const;
    const opts = { topic: channel } as const;
    expect(
      await reason(world, 'realtime', { topic: channel, exp: NOW + 60 }, opts)
    ).toBe('ok');
    expect(
      await reason(world, 'realtime', { topic: channel, exp: NOW + 61 }, opts)
    ).toBe('time');
    expect(await reason(world, 'realtime', { exp: NOW + 601 })).toBe('time');
    expect(
      await reason(world, 'realtime', {
        topic: { kind: 'meet', id: 'room-1', x: 1 },
      })
    ).toBe('claims');
    expect(
      await reason(world, 'realtime', { topic: { kind: 'call', id: 'room-1' } })
    ).toBe('claims');
    expect(
      await reason(world, 'realtime', { topic: { kind: 'meet', id: '' } })
    ).toBe('claims');
  });

  it('requires access ws, accepts an empty list and rejects a bad one', async () => {
    const world = await createWorld(['access']);
    expect(await reason(world, 'access', { ws: undefined })).toBe('claims');
    expect(await reason(world, 'access', { ws: [] })).toBe('ok');
    expect(await reason(world, 'access', { ws: ['not-a-uuid'] })).toBe(
      'claims'
    );
    expect(await reason(world, 'access', { ws: 'all' })).toBe('claims');
  });

  it('enforces the step-up profile members', async () => {
    const world = await createWorld(['stepup']);
    expect(await reason(world, 'stepup', { amr: ['pwd'] })).toBe('claims');
    expect(await reason(world, 'stepup', { amr: [] })).toBe('claims');
    expect(await reason(world, 'stepup', { aal: 'aal1' })).toBe('claims');
    expect(await reason(world, 'stepup', { act: 'vault.other' })).toBe(
      'claims'
    );
    expect(await reason(world, 'stepup', { ph: 'AAAA' })).toBe('claims');
    expect(await reason(world, 'stepup', { nonce: 'AAAA' })).toBe('claims');
    expect(await reason(world, 'stepup', { auth_time: NOW - 301 })).toBe(
      'time'
    );
    expect(await reason(world, 'stepup', { exp: NOW + 301 })).toBe('time');
    expect(
      await reason(world, 'stepup', { iat: NOW - 1, exp: NOW + 299 })
    ).toBe('ok');
  });

  it('returns frozen claims', async () => {
    const world = await createWorld(['realtime']);
    const token = await signAs(world, 'realtime', fullClaims('realtime'));
    const result = await verifyToken(
      'realtime',
      token,
      world.verifyOptions('realtime')
    );
    if (!result.ok) throw new Error(result.reason);
    expect(Object.isFrozen(result.token)).toBe(true);
    expect(Object.isFrozen(result.token.claims.topic)).toBe(true);
  });

  it('rejects an unknown class', async () => {
    const world = await createWorld(['identity']);
    expect(
      await verifyToken(
        'admin' as never,
        'a.b.c',
        world.verifyOptions('identity') as never
      )
    ).toEqual({ ok: false, reason: 'type' });
  });
});
