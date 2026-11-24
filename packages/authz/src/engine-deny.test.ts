// Deny branches that each need their own test, so removing a guard fails.

import { describe, expect, it } from 'vitest';
import { SnapshotCache } from './cache';
import { createEngine } from './engine';
import { makeScopePredicate, readScopePredicate } from './scope';
import { InMemoryPermissionSource } from './testing';
import type { AuthzPrincipal, PermissionSource, Policy } from './types';

const NOW = 1_800_000_000_000;
const USER = 'user-1';
const WS = 'ws-a';

const policy: Policy = {
  type: 'doc',
  actions: {
    none: { kind: 'all', rules: [] },
    own: { kind: 'owner', column: 'creator_id' },
    read: { kind: 'member' },
    strong: { kind: 'aal2' },
    weird: { kind: 'mystery' } as never,
  },
  scopes: { read: 'docs:read', strong: 'docs:read' },
};

function engineWith(source: PermissionSource) {
  return createEngine({
    policies: [policy],
    source,
    knownPermissions: new Set(),
    now: () => NOW,
  });
}

function memberSource() {
  const source = new InMemoryPermissionSource();
  source.addUser(USER);
  source.addWorkspace(WS);
  source.grant(USER, WS);
  return source;
}

const user = (over: Record<string, unknown> = {}) =>
  ({
    kind: 'user',
    userId: USER,
    appId: 'docs',
    credential: { kind: 'identity', aal: 'aal2', amr: ['pwd'], authTime: 1 },
    expiresAt: NOW / 1000 + 60,
    ...over,
  }) as AuthzPrincipal;

const token = (allowedWsIds: string[]) =>
  user({ credential: { kind: 'access', scopes: ['docs:read'], allowedWsIds } });

describe('rule shapes', () => {
  it('denies an empty all, in check and in scope', async () => {
    const engine = engineWith(memberSource());
    expect(
      await engine.check(user(), 'none', { type: 'doc', wsId: WS })
    ).toMatchObject({ allow: false });
    const scoped = await engine.scope(user(), 'none', 'doc', WS);
    expect(scoped.allow && readScopePredicate(scoped.predicate)).toEqual({
      op: 'false',
    });
  });

  it('denies an owner rule when the resource has no row image', async () => {
    const engine = engineWith(memberSource());
    expect(
      await engine.check(user(), 'own', { type: 'doc', wsId: WS })
    ).toMatchObject({ allow: false, reason: 'rule' });
  });

  it('denies an unknown rule kind from an untyped policy', async () => {
    const engine = engineWith(memberSource());
    expect(
      await engine.check(user(), 'weird', { type: 'doc', wsId: WS })
    ).toMatchObject({ allow: false, reason: 'evaluation_error' });
    expect(await engine.scope(user(), 'weird', 'doc', WS)).toMatchObject({
      allow: false,
    });
  });
});

describe('principal and resource shapes', () => {
  it('denies a non-user principal, an unknown credential kind and an empty workspace', async () => {
    const engine = engineWith(memberSource());
    expect(
      await engine.check(user({ kind: 'api_key' }), 'read', {
        type: 'doc',
        wsId: WS,
      })
    ).toMatchObject({ allow: false });
    expect(
      await engine.check(user({ credential: { kind: 'magic' } }), 'read', {
        type: 'doc',
        wsId: WS,
      })
    ).toMatchObject({ allow: false });
    expect(
      await engine.check(user(), 'read', { type: 'doc', wsId: '' })
    ).toMatchObject({ allow: false, as: 'not_found' });
  });

  it('treats a foreign ws_id in the before image as not found, and allows an image without ws_id', async () => {
    const engine = engineWith(memberSource());
    expect(
      await engine.check(user(), 'read', {
        type: 'doc',
        wsId: WS,
        before: { ws_id: 'ws-b' },
      })
    ).toEqual({ allow: false, reason: 'foreign_workspace', as: 'not_found' });
    expect(
      await engine.check(user(), 'read', {
        type: 'doc',
        wsId: WS,
        before: { title: 'x' },
      })
    ).toEqual({ allow: true });
  });

  it('applies access-token limits in scope as in check', async () => {
    const engine = engineWith(memberSource());
    expect(
      await engine.scope(token(['ws-b']), 'read', 'doc', WS)
    ).toMatchObject({ allow: false, as: 'not_found' });
    expect(await engine.scope(token([WS]), 'own', 'doc', WS)).toMatchObject({
      allow: false,
      reason: 'no_scope_mapping',
    });
    const strong = await engine.scope(token([WS]), 'strong', 'doc', WS);
    expect(strong.allow && readScopePredicate(strong.predicate)).toEqual({
      op: 'false',
    });
  });
});

describe('source failures after a good version read', () => {
  const versions = async () => ({
    ok: true as const,
    versions: { principal: 1n, workspace: 1n },
  });

  it('denies when resolve throws or reports a missing or deleted row', async () => {
    const throwing = engineWith({
      versions,
      resolve: async () => {
        throw new Error('timeout');
      },
    });
    expect(
      await throwing.check(user(), 'read', { type: 'doc', wsId: WS })
    ).toMatchObject({ reason: 'source_error' });
    const missing = engineWith({
      versions,
      resolve: async () => ({ ok: false, reason: 'missing' }),
    });
    expect(
      await missing.check(user(), 'read', { type: 'doc', wsId: WS })
    ).toMatchObject({ reason: 'version_missing' });
    const deleted = engineWith({
      versions,
      resolve: async () => ({ ok: false, reason: 'deleted' }),
    });
    expect(
      await deleted.check(user(), 'read', { type: 'doc', wsId: WS })
    ).toMatchObject({ reason: 'version_deleted' });
  });

  it('never caches a stale resolve', async () => {
    let resolves = 0;
    const engine = engineWith({
      versions: async () => ({
        ok: true,
        versions: { principal: 2n, workspace: 1n },
      }),
      resolve: async () => {
        resolves += 1;
        return {
          ok: true,
          versions: { principal: 1n, workspace: 1n },
          snapshot: { wsId: WS, member: true, permissions: new Set() },
        };
      },
    });
    await engine.check(user(), 'read', { type: 'doc', wsId: WS });
    expect(
      await engine.check(user(), 'read', { type: 'doc', wsId: WS })
    ).toMatchObject({ reason: 'stale_resolve' });
    expect(resolves).toBe(2);
  });
});

describe('SnapshotCache', () => {
  const snap = (wsId: string, member: boolean) => ({
    wsId,
    member,
    permissions: new Set<string>(),
  });
  const key = (id: string) => ({ kind: 'user' as const, id });

  it('never replaces an entry with lower versions', () => {
    const cache = new SnapshotCache(60_000, () => NOW);
    cache.set(key('u'), WS, { principal: 5n, workspace: 5n }, snap(WS, false));
    cache.set(key('u'), WS, { principal: 4n, workspace: 9n }, snap(WS, true));
    expect(
      cache.get(key('u'), WS, { principal: 5n, workspace: 5n })?.member
    ).toBe(false);
    expect(
      cache.get(key('u'), WS, { principal: 4n, workspace: 9n })
    ).toBeUndefined();
  });

  it('keeps users and workspaces apart, even with separator characters in ids', () => {
    const cache = new SnapshotCache(60_000, () => NOW);
    const v = { principal: 1n, workspace: 1n };
    cache.set(key('a\u0000b'), 'c', v, snap('c', true));
    expect(cache.get(key('a'), 'b\u0000c', v)).toBeUndefined();
    expect(cache.get(key('a\u0000b'), 'c', v)?.member).toBe(true);
    expect(cache.get(key('a\u0000b'), 'other', v)).toBeUndefined();
  });
});

it('keeps scope predicates opaque', () => {
  const predicate = makeScopePredicate({
    op: 'or',
    items: [{ op: 'eq', column: 'c', value: 'v' }],
  });
  expect(Object.getOwnPropertySymbols(predicate)).toEqual([]);
  expect(Object.keys(predicate)).toEqual([]);
  const tree = readScopePredicate(predicate) as unknown as {
    items: readonly unknown[];
  };
  expect(
    Object.isFrozen(tree) &&
      Object.isFrozen(tree.items) &&
      Object.isFrozen(tree.items[0])
  ).toBe(true);
});
