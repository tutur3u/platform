import { describe, expect, it } from 'vitest';
import { createEngine } from './engine';
import { readScopePredicate } from './scope';
import { InMemoryPermissionSource } from './testing';
import type {
  AuthzPrincipal,
  Policy,
  PermissionSource,
  ResolveResult,
  VersionRead,
} from './types';

const NOW = 1_800_000_000_000;
const USER = '00000000-0000-4000-8000-000000000001';
const WS = 'ws-a';
const OTHER_WS = 'ws-b';

const notes: Policy = {
  type: 'note',
  actions: {
    read: { kind: 'member' },
    list: {
      kind: 'any',
      rules: [
        { kind: 'permission', permission: 'manage_notes' },
        { kind: 'owner', column: 'creator_id' },
      ],
    },
    update: { kind: 'owner', column: 'creator_id' },
    delete: { kind: 'permission', permission: 'manage_notes' },
    export: {
      kind: 'all',
      rules: [
        { kind: 'aal2' },
        { kind: 'permission', permission: 'manage_notes' },
      ],
    },
    typo: { kind: 'permission', permission: 'not_a_real_permission' },
    empty: { kind: 'any', rules: [] },
  },
  scopes: { read: 'notes:read', list: 'notes:read' },
};

function setup<S extends PermissionSource = InMemoryPermissionSource>(
  source: S = new InMemoryPermissionSource() as unknown as S
) {
  if (source instanceof InMemoryPermissionSource) {
    source.addUser(USER);
    source.addWorkspace(WS);
    source.addWorkspace(OTHER_WS);
  }
  let now = NOW;
  const engine = createEngine({
    policies: [notes],
    source,
    knownPermissions: new Set(['manage_notes']),
    now: () => now,
  });
  return { engine, source, advance: (ms: number) => (now += ms) };
}

const identity = (over: Partial<AuthzPrincipal> = {}): AuthzPrincipal => ({
  kind: 'user',
  userId: USER,
  appId: 'notes',
  credential: {
    kind: 'identity',
    aal: 'aal1',
    amr: ['pwd'],
    authTime: NOW / 1000,
  },
  expiresAt: NOW / 1000 + 60,
  ...over,
});

const access = (scopes: string[], allowedWsIds: string[]): AuthzPrincipal =>
  identity({ credential: { kind: 'access', scopes, allowedWsIds } });

const note = (over: Record<string, unknown> = {}) => ({
  type: 'note',
  wsId: WS,
  before: { ws_id: WS, creator_id: USER, ...over },
});

describe('deny by default', () => {
  it('denies an unknown type, an unknown action and an unknown permission', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS, ['manage_notes']);
    expect(
      await engine.check(identity(), 'read', { type: 'other', wsId: WS })
    ).toMatchObject({ allow: false, reason: 'no_policy' });
    expect(await engine.check(identity(), 'archive', note())).toMatchObject({
      allow: false,
      reason: 'no_policy',
    });
    expect(await engine.check(identity(), 'typo', note())).toMatchObject({
      allow: false,
      reason: 'unknown_permission',
    });
    expect(await engine.check(identity(), 'empty', note())).toMatchObject({
      allow: false,
      reason: 'rule',
    });
  });

  it('never treats an inherited property as a policy action or scope', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS, ['manage_notes']);
    for (const action of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(await engine.check(identity(), action, note())).toMatchObject({
        allow: false,
        reason: 'no_policy',
      });
      expect(await engine.scope(identity(), action, 'note', WS)).toMatchObject({
        allow: false,
      });
    }
    expect(
      await engine.check(access(['notes:read'], [WS]), 'update', note())
    ).toMatchObject({ allow: false, reason: 'no_scope_mapping' });
  });

  it('denies an expired or malformed principal', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS);
    expect(
      await engine.check(identity({ expiresAt: NOW / 1000 }), 'read', note())
    ).toMatchObject({ reason: 'expired' });
    expect(
      await engine.check(identity({ expiresAt: Number.NaN }), 'read', note())
    ).toMatchObject({ reason: 'expired' });
    expect(
      await engine.check(identity({ userId: '' }), 'read', note())
    ).toMatchObject({ allow: false });
  });

  it('treats a non-member and a foreign ws_id as not found', async () => {
    const { engine, source } = setup();
    source.grant(USER, OTHER_WS);
    expect(await engine.check(identity(), 'read', note())).toEqual({
      allow: false,
      reason: 'not_member',
      as: 'not_found',
    });
    source.grant(USER, WS);
    const foreign = {
      type: 'note',
      wsId: WS,
      after: { ws_id: OTHER_WS, creator_id: USER },
    };
    expect(await engine.check(identity(), 'update', foreign)).toEqual({
      allow: false,
      reason: 'foreign_workspace',
      as: 'not_found',
    });
  });

  it('checks both row images, so a write cannot move a row out of the rule', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS);
    const handOff = {
      type: 'note',
      wsId: WS,
      before: { ws_id: WS, creator_id: USER },
      after: { ws_id: WS, creator_id: 'someone-else' },
    };
    expect(await engine.check(identity(), 'update', handOff)).toMatchObject({
      allow: false,
      reason: 'rule',
    });
    const takeOver = {
      type: 'note',
      wsId: WS,
      before: { ws_id: WS, creator_id: 'someone-else' },
      after: { ws_id: WS, creator_id: USER },
    };
    expect(await engine.check(identity(), 'update', takeOver)).toMatchObject({
      allow: false,
    });
    expect(await engine.check(identity(), 'update', note())).toEqual({
      allow: true,
    });
  });
});

describe('credentials', () => {
  it('limits an access token to its workspaces and mapped scopes', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS, ['manage_notes']);
    expect(
      await engine.check(access(['notes:read'], [OTHER_WS]), 'read', note())
    ).toEqual({
      allow: false,
      reason: 'outside_token_workspaces',
      as: 'not_found',
    });
    expect(await engine.check(access([], [WS]), 'read', note())).toMatchObject({
      reason: 'missing_scope',
    });
    expect(
      await engine.check(access(['notes:read'], [WS]), 'delete', note())
    ).toMatchObject({ reason: 'no_scope_mapping' });
    expect(
      await engine.check(access(['notes:read'], [WS]), 'read', note())
    ).toEqual({ allow: true });
  });

  it('never grants an assurance rule to an access token', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS, ['manage_notes']);
    const strong = identity({
      credential: {
        kind: 'identity',
        aal: 'aal2',
        amr: ['pwd', 'totp'],
        authTime: NOW / 1000,
      },
    });
    expect(await engine.check(strong, 'export', note())).toEqual({
      allow: true,
    });
    expect(await engine.check(identity(), 'export', note())).toMatchObject({
      allow: false,
    });
    const token = createEngine({
      policies: [{ ...notes, scopes: { export: 'notes:export' } }],
      source,
      knownPermissions: new Set(['manage_notes']),
      now: () => NOW,
    });
    expect(
      await token.check(access(['notes:export'], [WS]), 'export', note())
    ).toMatchObject({ allow: false });
  });
});

describe('versions and the snapshot cache', () => {
  it('reuses a snapshot while versions match and applies a revocation on the next request', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS, ['manage_notes']);
    expect(await engine.check(identity(), 'delete', note())).toEqual({
      allow: true,
    });
    expect(await engine.check(identity(), 'delete', note())).toEqual({
      allow: true,
    });
    expect(source.calls.resolve).toBe(1);
    expect(source.calls.versions).toBe(2);
    source.revoke(USER, WS);
    expect(await engine.check(identity(), 'delete', note())).toMatchObject({
      allow: false,
      as: 'not_found',
    });
  });

  it('denies, with no cache fallback, when the source fails', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS);
    expect(await engine.check(identity(), 'read', note())).toEqual({
      allow: true,
    });
    source.fail = true;
    expect(await engine.check(identity(), 'read', note())).toMatchObject({
      allow: false,
      reason: 'source_error',
    });
  });

  it('denies a missing or deleted version row', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS);
    expect(
      await engine.check(identity(), 'read', {
        type: 'note',
        wsId: 'ws-unknown',
      })
    ).toMatchObject({ reason: 'version_missing' });
    source.workspaces.get(WS)!.deleted = true;
    expect(await engine.check(identity(), 'read', note())).toMatchObject({
      reason: 'version_deleted',
    });
  });

  it('refuses a resolve older than the request version read and a snapshot for another workspace', async () => {
    const versions = (principal: bigint): VersionRead => ({
      ok: true,
      versions: { principal, workspace: 1n },
    });
    const make = (resolve: () => ResolveResult): PermissionSource => ({
      versions: async () => versions(5n),
      resolve: async () => resolve(),
    });
    const stale = setup(
      make(() => ({
        ok: true,
        versions: { principal: 4n, workspace: 1n },
        snapshot: { wsId: WS, member: true, permissions: new Set() },
      }))
    );
    expect(await stale.engine.check(identity(), 'read', note())).toMatchObject({
      reason: 'stale_resolve',
    });
    const mismatch = setup(
      make(() => ({
        ok: true,
        versions: { principal: 5n, workspace: 1n },
        snapshot: { wsId: OTHER_WS, member: true, permissions: new Set() },
      }))
    );
    expect(await mismatch.engine.check(identity(), 'read', note())).toEqual({
      allow: false,
      reason: 'snapshot_mismatch',
      as: 'not_found',
    });
  });

  it('expires cached snapshots after the TTL', async () => {
    const { engine, source, advance } = setup();
    source.grant(USER, WS);
    await engine.check(
      identity({ expiresAt: NOW / 1000 + 3600 }),
      'read',
      note()
    );
    advance(61_000);
    await engine.check(
      identity({ expiresAt: NOW / 1000 + 3600 }),
      'read',
      note()
    );
    expect(source.calls.resolve).toBe(2);
  });
});

describe('scope predicates', () => {
  it('compiles rules into a row predicate, and gates it like check', async () => {
    const { engine, source } = setup();
    source.grant(USER, WS);
    const owned = await engine.scope(identity(), 'list', 'note', WS);
    expect(owned.allow && readScopePredicate(owned.predicate)).toEqual({
      op: 'or',
      items: [{ op: 'false' }, { op: 'eq', column: 'creator_id', value: USER }],
    });
    source.grant(USER, WS, ['manage_notes']);
    const all = await engine.scope(identity(), 'list', 'note', WS);
    expect(all.allow && readScopePredicate(all.predicate)).toEqual({
      op: 'or',
      items: [{ op: 'true' }, { op: 'eq', column: 'creator_id', value: USER }],
    });
    expect(
      await engine.scope(identity(), 'list', 'note', 'ws-unknown')
    ).toMatchObject({ allow: false });
    expect(await engine.scope(identity(), 'typo', 'note', WS)).toMatchObject({
      allow: false,
      reason: 'unknown_permission',
    });
  });

  it('refuses to read a value that is not a scope predicate', () => {
    expect(() => readScopePredicate({} as never)).toThrow();
  });
});

it('rejects two policies for one type', () => {
  expect(() =>
    createEngine({
      policies: [notes, notes],
      source: new InMemoryPermissionSource(),
      knownPermissions: new Set(),
    })
  ).toThrow(/Duplicate/);
});
