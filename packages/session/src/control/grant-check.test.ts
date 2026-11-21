import { describe, expect, it } from 'vitest';
import {
  applyGrantRun,
  GRANT_READ_MAX_AGE_MS,
  type GrantCheckState,
  type GrantRun,
} from './grant-check';
import type { CfMember } from './grants';

const NOW = 1_800_000_000_000;
const classifier = {
  authScripts: ['tuturuuu-auth'],
  gatewayScripts: ['tuturuuu-gateway'],
  scriptResource: () => null,
  waivers: [],
};
const admin: CfMember = {
  id: 'm1',
  roles: [{ name: 'Administrator' }],
  policies: [],
};
const reader: CfMember = {
  id: 'm2',
  roles: [{ name: 'Administrator Read Only' }],
  policies: [],
};

/** Listings as structured values; each is sent as its JSON text. */
type Listings = {
  members?: unknown;
  userGroups?: unknown;
  userGroupMembers?: unknown;
  tokens?: unknown;
  capReached?: boolean;
};

const asText = (value: unknown) =>
  (typeof value === 'string' ? value : JSON.stringify(value)) as string;

function run(members: CfMember[], over: Listings = {}): GrantRun {
  const listings = {
    members: { items: members, hasMore: false },
    userGroups: { items: [{ id: 'g1', policies: [] }], hasMore: false },
    userGroupMembers: { g1: { items: [], hasMore: false } },
    tokens: { items: [], hasMore: false },
    ...over,
  };
  return {
    kind: 'read',
    members: asText(listings.members),
    userGroups: asText(listings.userGroups),
    userGroupMembers: asText(listings.userGroupMembers),
    tokens: asText(listings.tokens),
    capReached: over.capReached ?? false,
  };
}

const fresh: GrantCheckState = {
  identityBlocked: false,
  lastSuccessAtMs: NOW - 60_000,
};

const apply = (
  grantRun: GrantRun,
  previous: GrantCheckState | null = fresh,
  nowMs = NOW
) => applyGrantRun({ run: grantRun, previous, nowMs, classifier });

describe('applyGrantRun', () => {
  it('clears the block and moves the success time on a clean complete read', () => {
    const result = apply(run([reader]), {
      identityBlocked: true,
      lastSuccessAtMs: NOW - 60_000,
    });
    expect(result).toMatchObject({
      outcome: 'clean',
      alert: false,
      state: { identityBlocked: false, lastSuccessAtMs: NOW },
    });
  });

  it('sets identityBlocked on a standing Worker-wide grant', () => {
    expect(apply(run([admin]))).toMatchObject({
      outcome: 'blocked',
      alert: true,
      state: { identityBlocked: true, lastSuccessAtMs: NOW },
      findings: [{ id: 'm1' }],
    });
  });

  it('counts a run that reaches its cap on the last page as a success', () => {
    expect(apply(run([reader], { capReached: true }))).toMatchObject({
      outcome: 'clean',
      state: { lastSuccessAtMs: NOW },
    });
  });

  it.each([
    ['members', { members: { items: [], hasMore: true } }],
    ['user groups', { userGroups: { items: [], hasMore: true } }],
    ['account tokens', { tokens: { items: [], hasMore: true } }],
    [
      'user group members',
      { userGroupMembers: { g1: { items: [], hasMore: true } } },
    ],
    ['a group with no members listing', { userGroupMembers: {} }],
  ])(
    'keeps the block and success time when a page of %s remains unread at the cap',
    (_, over) => {
      const previous = { identityBlocked: true, lastSuccessAtMs: NOW - 60_000 };
      const result = apply(
        run([reader], { ...over, capReached: true }),
        previous
      );
      expect(result).toMatchObject({
        outcome: 'unread_page',
        alert: true,
        state: previous,
      });
    }
  );

  it('keeps a cleared state on an error without moving the success time', () => {
    const result = apply({ kind: 'error', reason: '429' });
    expect(result).toMatchObject({
      outcome: 'error',
      alert: true,
      state: fresh,
    });
  });

  it('keeps the state on a malformed payload', () => {
    const result = apply(run([{ id: 'm1', roles: [], policies: {} }]));
    expect(result).toMatchObject({ outcome: 'malformed', state: fresh });
  });

  it.each([
    ['omitted member items', { members: { hasMore: false } }],
    ['null member items', { members: { items: null, hasMore: false } }],
    ['omitted user group items', { userGroups: { hasMore: false } }],
    ['omitted token items', { tokens: { hasMore: false } }],
    ['a missing members listing', { members: undefined }],
    ['a non-boolean hasMore', { tokens: { items: [], hasMore: 'no' } }],
    [
      'omitted group member items',
      { userGroupMembers: { g1: { hasMore: false } } },
    ],
    [
      'null group member items',
      { userGroupMembers: { g1: { items: null, hasMore: false } } },
    ],
    [
      'a member with omitted roles',
      { members: { items: [{ id: 'm2', policies: [] }], hasMore: false } },
    ],
    [
      'a member with null policies',
      {
        members: {
          items: [{ id: 'm2', roles: [], policies: null }],
          hasMore: false,
        },
      },
    ],
  ])('fails the read and keeps the block on %s', (_, over) => {
    const previous = { identityBlocked: true, lastSuccessAtMs: NOW - 60_000 };
    const result = apply(run([reader], over), previous);
    expect(result).toMatchObject({
      outcome: 'malformed',
      alert: true,
      state: previous,
    });
  });

  const ADMIN_TEXT =
    '{"items":[{"id":"m1","roles":[{"name":"Administrator"}],"policies":[]}],"hasMore":false}';

  it('matches the structured outcome for equivalent JSON text', () => {
    const structured = apply(run([admin]));
    const text = apply(run([], { members: ADMIN_TEXT }));
    const spaced = apply(
      run([], { members: ADMIN_TEXT.replace(/,/g, ' ,\n ') })
    );
    expect(structured).toMatchObject({ outcome: 'blocked' });
    expect(text).toEqual(structured);
    expect(spaced).toEqual(structured);
  });

  it.each([
    [
      'a duplicate items key',
      '{"items":[],"items":[{"id":"m1","roles":[],"policies":[]}],"hasMore":false}',
    ],
    ['a duplicate hasMore key', '{"items":[],"hasMore":true,"hasMore":false}'],
    [
      'items only under __proto__',
      '{"__proto__":{"items":[]},"hasMore":false}',
    ],
    [
      'a member id only under __proto__',
      '{"items":[{"__proto__":{"id":"m1"},"roles":[],"policies":[]}],"hasMore":false}',
    ],
    ['an object for items', '{"items":{},"hasMore":false}'],
    ['a string for hasMore', '{"items":[],"hasMore":"false"}'],
    ['a fractional number', '{"items":[],"hasMore":false,"total":1.5}'],
    ['trailing text', '{"items":[],"hasMore":false} {}'],
    ['an array root', '[]'],
  ])('fails the read on member listing text with %s', (_, members) => {
    const previous = { identityBlocked: true, lastSuccessAtMs: NOW - 60_000 };
    const result = apply(run([admin], { members }), previous);
    expect(result).toMatchObject({ outcome: 'malformed', state: previous });
  });

  it('fails the read on a group member listing text with a duplicate group', () => {
    const previous = { identityBlocked: true, lastSuccessAtMs: NOW - 60_000 };
    const userGroupMembers =
      '{"g1":{"items":[],"hasMore":true},"g1":{"items":[],"hasMore":false}}';
    expect(apply(run([reader], { userGroupMembers }), previous)).toMatchObject({
      outcome: 'malformed',
      state: previous,
    });
  });

  it('never accepts a structured object in place of listing text', () => {
    const previous = { identityBlocked: true, lastSuccessAtMs: NOW - 60_000 };
    let reads = 0;
    const flipping = {
      get items() {
        reads += 1;
        return reads === 1 ? [admin] : [];
      },
      hasMore: false,
    };
    const structured = { items: [reader], hasMore: false };
    for (const members of [flipping, structured]) {
      const grantRun = { ...run([]), members } as unknown as GrantRun;
      expect(apply(grantRun, previous)).toMatchObject({
        outcome: 'malformed',
        state: previous,
      });
    }
    expect(reads).toBe(0);
  });

  it('ignores a nowMs accessor as a missing clock', () => {
    let reads = 0;
    const input = {
      run: run([reader]),
      previous: fresh,
      classifier,
      get nowMs() {
        reads += 1;
        return NOW;
      },
    };
    expect(applyGrantRun(input)).toMatchObject({
      outcome: 'malformed',
      stale: true,
      state: { identityBlocked: true, lastSuccessAtMs: fresh.lastSuccessAtMs },
    });
    expect(reads).toBe(0);
  });

  it('ignores a run kind accessor as a failed run', () => {
    let reads = 0;
    const grantRun = {
      ...run([reader]),
      get kind() {
        reads += 1;
        return 'read';
      },
    } as unknown as GrantRun;
    expect(apply(grantRun)).toMatchObject({ outcome: 'error', state: fresh });
    expect(reads).toBe(0);
  });

  it('reads previous state as own data, an accessor as missing', () => {
    const previous = Object.defineProperties(
      {},
      {
        identityBlocked: { get: () => false, enumerable: true },
        lastSuccessAtMs: { get: () => NOW, enumerable: true },
      }
    ) as GrantCheckState;
    expect(apply({ kind: 'error', reason: 'api' }, previous)).toMatchObject({
      stale: true,
      state: { identityBlocked: true, lastSuccessAtMs: null },
    });
  });

  it('never takes state or kind from a polluted Object.prototype', () => {
    const proto = Object.prototype as {
      kind?: unknown;
      identityBlocked?: unknown;
      lastSuccessAtMs?: unknown;
    };
    proto.kind = 'read';
    proto.identityBlocked = false;
    proto.lastSuccessAtMs = NOW;
    try {
      const { kind: _, ...kindless } = run([reader]);
      expect(apply(kindless as never, {} as never)).toMatchObject({
        outcome: 'error',
        stale: true,
        state: { identityBlocked: true, lastSuccessAtMs: null },
      });
    } finally {
      delete proto.kind;
      delete proto.identityBlocked;
      delete proto.lastSuccessAtMs;
    }
  });

  it('fails the read on a classifier whose lists are not arrays', () => {
    const result = applyGrantRun({
      run: run([reader]),
      previous: fresh,
      nowMs: NOW,
      classifier: { ...classifier, authScripts: 'tuturuuu-auth' as never },
    });
    expect(result).toMatchObject({ outcome: 'malformed', state: fresh });
  });

  it('sets identityBlocked once the last success is older than 15 minutes', () => {
    const at = (age: number) =>
      apply(
        { kind: 'error', reason: 'api' },
        {
          identityBlocked: false,
          lastSuccessAtMs: NOW - age,
        }
      );
    expect(at(GRANT_READ_MAX_AGE_MS).state.identityBlocked).toBe(false);
    expect(at(GRANT_READ_MAX_AGE_MS + 1)).toMatchObject({
      stale: true,
      state: {
        identityBlocked: true,
        lastSuccessAtMs: NOW - GRANT_READ_MAX_AGE_MS - 1,
      },
    });
  });

  it('starts blocked with no successful read', () => {
    expect(apply({ kind: 'error', reason: 'api' }, null)).toMatchObject({
      stale: true,
      state: { identityBlocked: true, lastSuccessAtMs: null },
    });
  });
});
