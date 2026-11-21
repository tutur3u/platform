import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATOR_ROLES,
  type CfAccountToken,
  type CfMember,
  type CfUserGroup,
  classifyGrants,
  EXEMPT_ROLE,
  type GrantInput,
  WORKER_WRITE_PERMISSION_GROUPS,
} from './grants';

const NOW = 1_800_000_000_000;
const ACCOUNT = 'com.cloudflare.api.account.acc1';
const SCRIPT_PREFIX = 'com.cloudflare.edge.worker.script.';
const script = (name: string) => `${SCRIPT_PREFIX}${name}`;

const accountScope = { scope: { key: ACCOUNT, objects: [{ key: '*' }] } };
const scriptScope = (name: string) => ({
  scope: { key: ACCOUNT, objects: [{ key: script(name) }] },
});
const memberPolicy = (group: string, resourceGroups: unknown[]) => ({
  access: 'allow',
  permission_groups: [{ id: `pg-${group}`, name: group }],
  resource_groups: resourceGroups,
});
const tokenPolicy = (group: string, resources: Record<string, unknown>) => ({
  effect: 'allow',
  permission_groups: [{ id: `pg-${group}`, name: group }],
  resources,
});

/** Listings as structured values or raw text; each is sent as JSON text. */
type Over = Partial<
  Omit<GrantInput, 'members' | 'userGroups' | 'userGroupMembers' | 'tokens'>
> & {
  members?: unknown;
  userGroups?: unknown;
  userGroupMembers?: unknown;
  tokens?: unknown;
};

const asText = (value: unknown) =>
  (typeof value === 'string' ? value : JSON.stringify(value)) as string;

function input(over: Over = {}): GrantInput {
  const merged = {
    members: [] as unknown,
    userGroups: [] as unknown,
    userGroupMembers: {} as unknown,
    tokens: [] as unknown,
    authScripts: ['tuturuuu-auth', 'tuturuuu-auth-staging'],
    gatewayScripts: ['tuturuuu-gateway'],
    scriptResource: (key: string) =>
      key.startsWith(SCRIPT_PREFIX) ? key.slice(SCRIPT_PREFIX.length) : null,
    waivers: [] as GrantInput['waivers'],
    nowMs: NOW,
    ...over,
  };
  return {
    ...merged,
    members: asText(merged.members),
    userGroups: asText(merged.userGroups),
    userGroupMembers: asText(merged.userGroupMembers),
    tokens: asText(merged.tokens),
  };
}

const member = (id: string, extra: Partial<CfMember> = {}): CfMember => ({
  id,
  roles: [],
  policies: [],
  ...extra,
});

const classifyMember = (extra: Partial<CfMember>) =>
  classifyGrants(input({ members: [member('m1', extra)] }));

/** The spec's Admin and Editor permission groups that cover Workers. */
const SPEC_PERMISSION_GROUPS = [
  'Workers Admin',
  'Workers Editor',
  'Developer Platform Admin',
  'Developer Platform Editor',
  'Workers Platform Admin',
  'Workers Scripts Edit',
  'Workers Scripts Write',
  'Workers CI Edit',
  'Workers Observability Edit',
  'Workers Observability Telemetry Edit',
];
const SPEC_ADMINISTRATOR_ROLES = ['Administrator', 'Account Administrator'];

describe('Worker-wide names', () => {
  it('match the spec exactly', () => {
    expect([...WORKER_WRITE_PERMISSION_GROUPS]).toEqual(SPEC_PERMISSION_GROUPS);
    expect([...ADMINISTRATOR_ROLES]).toEqual(SPEC_ADMINISTRATOR_ROLES);
    expect(EXEMPT_ROLE).toBe('Super Administrator - All Privileges');
  });
});

describe('classifyGrants', () => {
  const blocking = [...SPEC_PERMISSION_GROUPS, ...SPEC_ADMINISTRATOR_ROLES];

  it.each(blocking)('blocks %s as an exact roles[].name', (name) => {
    const result = classifyMember({ roles: [{ id: 'r', name }] });
    expect(result).toMatchObject({
      ok: true,
      blocked: true,
      findings: [
        { kind: 'member', id: 'm1', reasons: [{ via: 'role', name }] },
      ],
    });
  });

  it.each(blocking)(
    'blocks %s as an account-scoped policy permission group',
    (name) => {
      const result = classifyMember({
        policies: [memberPolicy(name, [accountScope])],
      });
      expect(result).toMatchObject({
        ok: true,
        blocked: true,
        findings: [
          { reasons: [{ via: 'wide_policy', permissionGroup: name }] },
        ],
      });
    }
  );

  it('blocks a product-scoped grant with no objects', () => {
    const result = classifyMember({
      policies: [
        memberPolicy('Workers Admin', [
          { scope: { key: 'com.cloudflare.api.account.workers' } },
        ]),
      ],
    });
    expect(result).toMatchObject({ ok: true, blocked: true });
  });

  it.each([
    'Administrator Read Only',
    'Workers Scripts Read',
    'Workers Admin ',
    'workers admin',
    'Account Settings Read',
  ])('never counts %s', (name) => {
    const result = classifyMember({
      roles: [{ name }],
      policies: [memberPolicy(name, [accountScope])],
    });
    expect(result).toMatchObject({ ok: true, blocked: false, findings: [] });
  });

  it('exempts only the Super Administrator role', () => {
    const result = classifyGrants(
      input({
        members: [
          member('super', {
            roles: [{ name: EXEMPT_ROLE }, { name: 'Administrator' }],
          }),
          member('almost', {
            roles: [{ name: 'Super Administrator' }, { name: 'Administrator' }],
          }),
        ],
      })
    );
    expect(result).toMatchObject({
      ok: true,
      exempt: ['super'],
      blocked: true,
      findings: [{ id: 'almost' }],
    });
  });

  it('does not count a per-script deploy grant on one script', () => {
    const result = classifyMember({
      policies: [
        memberPolicy('Workers Editor', [scriptScope('tuturuuu-auth')]),
      ],
    });
    expect(result).toMatchObject({ ok: true, blocked: false, findings: [] });
  });

  it('blocks an identity whose direct and group policies together reach both auth and gateway', () => {
    const groups: CfUserGroup[] = [
      {
        id: 'g1',
        policies: [
          memberPolicy('Workers Scripts Edit', [
            scriptScope('tuturuuu-gateway'),
          ]),
        ],
      },
    ];
    const result = classifyGrants(
      input({
        members: [
          member('m1', {
            policies: [
              memberPolicy('Workers Editor', [scriptScope('tuturuuu-auth')]),
            ],
          }),
          member('m2', {
            policies: [
              memberPolicy('Workers Editor', [scriptScope('tuturuuu-auth')]),
            ],
          }),
        ],
        userGroups: groups,
        userGroupMembers: { g1: ['m1'] },
      })
    );
    expect(result).toMatchObject({
      ok: true,
      blocked: true,
      findings: [
        {
          id: 'm1',
          reasons: [
            {
              via: 'both_scripts',
              auth: 'tuturuuu-auth',
              gateway: 'tuturuuu-gateway',
            },
          ],
        },
      ],
    });
  });

  it('blocks a member through a user-group grant alone', () => {
    const result = classifyGrants(
      input({
        members: [member('m1')],
        userGroups: [
          {
            id: 'g1',
            policies: [memberPolicy('Workers Admin', [accountScope])],
          },
        ],
        userGroupMembers: { g1: ['m1'] },
      })
    );
    expect(result).toMatchObject({ blocked: true, findings: [{ id: 'm1' }] });
  });

  it('never counts read-only grants toward the both-scripts rule', () => {
    const result = classifyMember({
      policies: [
        memberPolicy('Workers Scripts Read', [accountScope]),
        memberPolicy('Workers Editor', [scriptScope('tuturuuu-auth')]),
        memberPolicy('Workers Scripts Read', [scriptScope('tuturuuu-gateway')]),
      ],
    });
    expect(result).toMatchObject({ blocked: false, findings: [] });
  });

  it('ignores deny policies rather than counting or subtracting them', () => {
    const result = classifyMember({
      policies: [
        { ...memberPolicy('Workers Admin', [accountScope]), access: 'deny' },
      ],
    });
    expect(result).toMatchObject({ blocked: false });
  });

  it('keeps an allow when a deny names the same Workers Admin scope', () => {
    const allow = memberPolicy('Workers Admin', [accountScope]);
    const result = classifyMember({
      policies: [allow, { ...allow, access: 'deny' }],
    });
    expect(result).toMatchObject({
      ok: true,
      blocked: true,
      findings: [
        { reasons: [{ via: 'wide_policy', permissionGroup: 'Workers Admin' }] },
      ],
    });
  });

  it('never exempts through a role name under __proto__', () => {
    const members = `[{"id":"m1","roles":[{"__proto__":{"name":"${EXEMPT_ROLE}"}},{"name":"Administrator"}],"policies":[]}]`;
    expect(classifyGrants(input({ members }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('never exempts through a duplicate role name', () => {
    const members = `[{"id":"m1","roles":[{"name":"${EXEMPT_ROLE}","name":"Administrator"}],"policies":[]}]`;
    expect(classifyGrants(input({ members }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('matches the structured outcome for equivalent JSON text', () => {
    const structured = classifyMember({
      policies: [memberPolicy('Workers Admin', [accountScope])],
    });
    const text = classifyGrants(
      input({
        members: `[ { "policies": [ { "resource_groups": [ { "scope": { "objects": [ { "key": "*" } ], "key": "${ACCOUNT}" } } ], "permission_groups": [ { "name": "Workers Admin", "id": "pg-Workers Admin" } ], "access": "allow" } ], "roles": [], "id": "m1" } ]`,
      })
    );
    expect(structured).toMatchObject({ ok: true, blocked: true });
    expect(text).toEqual(structured);
  });

  it('never accepts a structured listing in place of JSON text', () => {
    const admin = member('m1', { roles: [{ name: 'Administrator' }] });
    const structured = { ...input(), members: [admin] as never };
    expect(classifyGrants(structured)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('ignores a nowMs accessor, so no waiver is open', () => {
    let reads = 0;
    const base = input({
      members: [member('m1', { roles: [{ name: 'Workers Admin' }] })],
      waivers: [
        {
          id: 'W-1',
          identity: { kind: 'member', id: 'm1' },
          expiresAtMs: NOW + 1,
        },
      ],
    });
    const counted = Object.defineProperty({ ...base }, 'nowMs', {
      enumerable: true,
      get() {
        reads += 1;
        return NOW;
      },
    });
    expect(classifyGrants(counted)).toMatchObject({
      blocked: true,
      findings: [{ waiverId: null }],
    });
    expect(reads).toBe(0);
  });

  describe('account tokens', () => {
    const token = (policies: unknown[]): CfAccountToken => ({
      id: 't1',
      policies,
    });

    it('blocks an account-wide token policy', () => {
      const result = classifyGrants(
        input({
          tokens: [
            token([tokenPolicy('Workers Scripts Write', { [ACCOUNT]: '*' })]),
          ],
        })
      );
      expect(result).toMatchObject({
        blocked: true,
        findings: [{ kind: 'token', id: 't1' }],
      });
    });

    it('classifies a token on the union of all its policies', () => {
      const result = classifyGrants(
        input({
          tokens: [
            token([
              tokenPolicy('Workers Scripts Edit', {
                [ACCOUNT]: { [script('tuturuuu-auth-staging')]: '*' },
              }),
              tokenPolicy('Workers Editor', {
                [ACCOUNT]: { [script('tuturuuu-gateway')]: '*' },
              }),
            ]),
          ],
        })
      );
      expect(result).toMatchObject({
        blocked: true,
        findings: [{ reasons: [{ via: 'both_scripts' }] }],
      });
    });

    it('counts upload or secret-put rights the same as deploy', () => {
      const result = classifyGrants(
        input({
          tokens: [
            token([
              tokenPolicy('Workers Scripts Write', {
                [ACCOUNT]: {
                  [script('tuturuuu-auth')]: '*',
                  [script('tuturuuu-gateway')]: '*',
                },
              }),
            ]),
          ],
        })
      );
      expect(result).toMatchObject({ blocked: true });
    });

    it('never blocks an account-wide read token', () => {
      const result = classifyGrants(
        input({
          tokens: [
            token([
              tokenPolicy('Workers Scripts Read', { [ACCOUNT]: '*' }),
              tokenPolicy('Account Settings Read', { [ACCOUNT]: '*' }),
              tokenPolicy('Account API Tokens Read', { [ACCOUNT]: '*' }),
            ]),
          ],
        })
      );
      expect(result).toMatchObject({ blocked: false, findings: [] });
    });

    it('keeps the deploy split for script-scoped CI tokens', () => {
      const result = classifyGrants(
        input({
          tokens: [
            {
              id: 'auth-ci',
              policies: [
                tokenPolicy('Workers Editor', {
                  [ACCOUNT]: { [script('tuturuuu-auth')]: '*' },
                }),
              ],
            },
            {
              id: 'gw-ci',
              policies: [
                tokenPolicy('Workers Editor', {
                  [ACCOUNT]: { [script('tuturuuu-gateway')]: '*' },
                }),
              ],
            },
          ],
        })
      );
      expect(result).toMatchObject({ blocked: false, findings: [] });
    });
  });

  describe('waivers', () => {
    const admin = member('m1', { roles: [{ name: 'Workers Admin' }] });
    const waiver = (expiresAtMs: number, id = 'm1') => ({
      id: 'W-1',
      identity: { kind: 'member' as const, id },
      expiresAtMs,
    });

    it('does not block an identity covered by an open waiver', () => {
      const result = classifyGrants(
        input({ members: [admin], waivers: [waiver(NOW + 1)] })
      );
      expect(result).toMatchObject({
        blocked: false,
        findings: [{ id: 'm1', waiverId: 'W-1' }],
      });
    });

    it('copies the trusted waivers by own index, ignoring an overridden iterator', () => {
      const waivers: unknown[] = [];
      Object.setPrototypeOf(
        waivers,
        Object.assign(Object.create(Array.prototype), {
          *[Symbol.iterator]() {
            yield waiver(NOW + 1);
          },
        })
      );
      expect(
        classifyGrants(input({ members: [admin], waivers: waivers as never }))
      ).toMatchObject({ blocked: true, findings: [{ waiverId: null }] });
    });

    it('copies only own waiver fields from the trusted file', () => {
      const inherited = Object.create({
        id: 'W-1',
        identity: { kind: 'member', id: 'm1' },
        expiresAtMs: NOW + 1,
      });
      const inheritedIdentity = {
        id: 'W-1',
        identity: Object.create({ kind: 'member', id: 'm1' }),
        expiresAtMs: NOW + 1,
      };
      for (const entry of [inherited, inheritedIdentity]) {
        expect(
          classifyGrants(input({ members: [admin], waivers: [entry as never] }))
        ).toMatchObject({ blocked: true, findings: [{ waiverId: null }] });
      }
    });

    it('blocks once the waiver expires or names another identity', () => {
      for (const waivers of [[waiver(NOW)], [waiver(NOW + 1, 'm2')]]) {
        expect(
          classifyGrants(input({ members: [admin], waivers }))
        ).toMatchObject({ blocked: true, findings: [{ waiverId: null }] });
      }
    });
  });

  const allowAccount = memberPolicy('Workers Admin', [accountScope]);
  const { access: _access, ...noAccess } = allowAccount;
  const { resource_groups: _groups, ...noResourceGroups } = allowAccount;
  const { permission_groups: _pg, ...noPermissionGroups } = allowAccount;

  it.each([
    [
      'a non-array policies',
      { members: [{ id: 'm1', roles: [], policies: {} }] },
    ],
    ['a member without id', { members: [{ roles: [], policies: [] }] }],
    ['a member with omitted roles', { members: [{ id: 'm1', policies: [] }] }],
    ['a member with null roles', { members: [member('m1', { roles: null })] }],
    ['a member with omitted policies', { members: [{ id: 'm1', roles: [] }] }],
    [
      'a member with null policies',
      { members: [member('m1', { policies: null })] },
    ],
    ['a null members listing', { members: null }],
    ['an omitted tokens listing', { tokens: undefined }],
    ['a null user groups listing', { userGroups: null }],
    [
      'a group with omitted policies',
      { userGroups: [{ id: 'g1' }], userGroupMembers: { g1: [] } },
    ],
    [
      'a group with a null member list',
      {
        userGroups: [{ id: 'g1', policies: [] }],
        userGroupMembers: { g1: null },
      },
    ],
    ['a token with omitted policies', { tokens: [{ id: 't1' }] }],
    [
      'a policy with omitted permission_groups',
      { members: [member('m1', { policies: [noPermissionGroups] })] },
    ],
    [
      'a member policy with omitted resource_groups',
      { members: [member('m1', { policies: [noResourceGroups] })] },
    ],
    [
      'a member policy with omitted access',
      { members: [member('m1', { policies: [noAccess] })] },
    ],
    [
      'a member policy with an unknown access',
      {
        members: [
          member('m1', { policies: [{ ...allowAccount, access: 'Allow' }] }),
        ],
      },
    ],
    [
      'a token policy with omitted effect',
      {
        tokens: [
          {
            id: 't1',
            policies: [
              {
                permission_groups: [{ name: 'Workers Admin' }],
                resources: { [ACCOUNT]: '*' },
              },
            ],
          },
        ],
      },
    ],
    [
      'a member id only under __proto__',
      { members: '[{"__proto__":{"id":"m1"},"roles":[],"policies":[]}]' },
    ],
    [
      'a duplicate member id',
      { members: '[{"id":"m1","id":"m2","roles":[],"policies":[]}]' },
    ],
    [
      'a policy effect only under __proto__',
      {
        tokens: `[{"id":"t1","policies":[{"__proto__":{"effect":"deny"},"permission_groups":[{"name":"Workers Admin"}],"resources":{"${ACCOUNT}":"*"}}]}]`,
      },
    ],
    [
      'a duplicate policy effect',
      {
        tokens: `[{"id":"t1","policies":[{"effect":"allow","effect":"deny","permission_groups":[{"name":"Workers Admin"}],"resources":{"${ACCOUNT}":"*"}}]}]`,
      },
    ],
    ['a numeric member id', { members: '[{"id":7,"roles":[],"policies":[]}]' }],
    ['an object for the members listing', { members: '{"0":{"id":"m1"}}' }],
    ['unparseable members text', { members: '[{"id":"m1",}]' }],
    [
      'a fractional number anywhere',
      { members: '[{"id":"m1","roles":[],"policies":[],"weight":0.5}]' },
    ],
    [
      'a duplicate group in the member id lists',
      {
        userGroups: [{ id: 'g1', policies: [] }],
        userGroupMembers: '{"g1":[],"g1":["m1"]}',
      },
    ],
    [
      'a group with no members listing',
      { userGroups: [{ id: 'g1', policies: [] }] },
    ],
    ['members of an unlisted group', { userGroupMembers: { g9: ['m1'] } }],
    [
      'a token with string resources',
      {
        tokens: [
          {
            id: 't',
            policies: [{ permission_groups: [{ name: 'x' }], resources: 'x' }],
          },
        ],
      },
    ],
  ])('fails the read on %s', (_, over) => {
    expect(classifyGrants(input(over as Over))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
