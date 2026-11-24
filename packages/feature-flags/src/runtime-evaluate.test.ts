import { describe, expect, it } from 'vitest';
import { featureFlagCatalog, validateFlag } from './catalog';
import type { CatalogFlag } from './lifecycle.mjs';
import { validateRuntimeDefinition } from './runtime-definition.mjs';
import {
  evaluateRuntimeFlag,
  rolloutBucket,
  type RuntimeEvaluationContext,
  type RuntimeRule,
} from './runtime-evaluate';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

function runtimeFlag(overrides: Partial<CatalogFlag> = {}): CatalogFlag {
  return {
    key: 'TEST_RUNTIME_FLAG',
    family: 'runtime',
    kind: 'release',
    scope: 'global',
    description: 'Test flag.',
    owner: 'platform',
    createdAt: '2026-11-25',
    apps: ['web'],
    appsComplete: true,
    sources: ['packages/feature-flags/src/runtime-evaluate.test.ts'],
    defaults: { development: false, staging: false, production: false },
    verifiedOnProdAt: null,
    legacy: false,
    rollout: { stage: 'internal', owner: 'platform', removeBy: '2027-02-28' },
    runtime: {
      type: 'boolean',
      scopes: ['platform', 'workspace', 'user'],
      controllers: {
        platform: 'platform-admin',
        workspace: 'platform-admin',
        user: 'platform-admin',
      },
      envFallback: 'TEST_RUNTIME_FLAG',
      clientExposed: false,
    },
    ...overrides,
  } as CatalogFlag;
}

const member: RuntimeEvaluationContext = {
  isStaff: false,
  userId: USER,
  workspaceId: WS,
};

function rule(partial: Partial<RuntimeRule>): RuntimeRule {
  return {
    flagKey: 'TEST_RUNTIME_FLAG',
    mode: 'on',
    scope: 'platform',
    subjectId: null,
    ...partial,
  };
}

describe('runtime flag definitions', () => {
  it('accepts the catalog runtime entries and keeps them off by default', () => {
    const runtime = featureFlagCatalog.flags.filter(
      (flag) => flag.family === 'runtime'
    );
    expect(runtime.length).toBeGreaterThan(0);
    for (const flag of runtime) {
      expect(validateFlag(flag), flag.key).toEqual([]);
      expect(Object.values(flag.defaults), flag.key).toEqual([
        false,
        false,
        false,
      ]);
      expect([null, flag.key], flag.key).toContain(flag.runtime?.envFallback);
    }
  });

  it('rejects a runtime flag that defaults on or lacks its block', () => {
    expect(
      validateFlag(
        runtimeFlag({
          defaults: { development: true, staging: false, production: false },
        })
      )
    ).toContain(
      'TEST_RUNTIME_FLAG: runtime flags default to false in every environment'
    );
    expect(validateFlag(runtimeFlag({ runtime: undefined }))).toContain(
      'TEST_RUNTIME_FLAG: runtime flags require a runtime block'
    );
  });

  it('rejects self or workspace-admin control of the platform scope', () => {
    expect(
      validateRuntimeDefinition({
        type: 'boolean',
        scopes: ['platform', 'user'],
        controllers: { platform: 'self', user: 'self' },
        envFallback: null,
        clientExposed: false,
      })
    ).toContain('runtime.controllers.platform must be platform-admin');
    expect(
      validateRuntimeDefinition({
        type: 'boolean',
        scopes: ['workspace'],
        controllers: { workspace: 'workspace-admin' },
        envFallback: 'lower_case',
        clientExposed: false,
      })
    ).toEqual(
      expect.arrayContaining([
        'runtime.scopes must include platform',
        'runtime.envFallback must be an env var name or null',
      ])
    );
  });
});

describe('runtime definition hardening', () => {
  it.each(['__proto__', 'toString'])(
    'reports the inherited object key %s as an invalid scope',
    (scope) => {
      const definition = {
        type: 'boolean',
        scopes: ['platform', scope],
        controllers: { platform: 'platform-admin' },
        envFallback: null,
        clientExposed: false,
      };
      expect(() => validateRuntimeDefinition(definition)).not.toThrow();
      expect(validateRuntimeDefinition(definition)).toContain(
        'runtime.scopes must list unique platform/workspace/user'
      );
    }
  );
});

describe('evaluateRuntimeFlag', () => {
  it('defaults off with no rules and no environment value', () => {
    const decision = evaluateRuntimeFlag({
      context: member,
      flag: runtimeFlag(),
      rules: null,
    });
    expect(decision).toMatchObject({ enabled: false, source: 'default' });
  });

  it('uses the environment fallback only while no rule exists', () => {
    const flag = runtimeFlag();
    expect(
      evaluateRuntimeFlag({
        context: member,
        envValue: 'true',
        flag,
        rules: [],
      })
    ).toMatchObject({ enabled: true, source: 'env-fallback' });
    expect(
      evaluateRuntimeFlag({
        context: member,
        envValue: 'TRUE',
        flag,
        rules: null,
      }).enabled
    ).toBe(false);
    expect(
      evaluateRuntimeFlag({
        context: member,
        envValue: 'true',
        flag,
        rules: [rule({ mode: 'off' })],
      })
    ).toMatchObject({ enabled: false, source: 'platform' });
  });

  it('lets a workspace rule override the platform rule', () => {
    const decision = evaluateRuntimeFlag({
      context: member,
      flag: runtimeFlag(),
      rules: [
        rule({ mode: 'off' }),
        rule({ scope: 'workspace', subjectId: WS, mode: 'on' }),
        rule({ scope: 'workspace', subjectId: OTHER_WS, mode: 'off' }),
      ],
    });
    expect(decision).toMatchObject({ enabled: true, source: 'workspace' });
  });

  it('applies a platform-controlled user rule above the workspace rule', () => {
    const decision = evaluateRuntimeFlag({
      context: member,
      flag: runtimeFlag(),
      rules: [
        rule({ scope: 'workspace', subjectId: WS, mode: 'off' }),
        rule({ scope: 'user', subjectId: USER, mode: 'on' }),
      ],
    });
    expect(decision).toMatchObject({ enabled: true, source: 'user' });
  });

  it('never lets a self-controlled user rule grant the feature', () => {
    const flag = runtimeFlag({
      runtime: {
        type: 'boolean',
        scopes: ['platform', 'user'],
        controllers: { platform: 'platform-admin', user: 'self' },
        envFallback: null,
        clientExposed: false,
      },
    });
    const selfOn = rule({ scope: 'user', subjectId: USER, mode: 'on' });
    expect(
      evaluateRuntimeFlag({
        context: member,
        flag,
        rules: [rule({ mode: 'off' }), selfOn],
      }).enabled
    ).toBe(false);
    expect(
      evaluateRuntimeFlag({
        context: member,
        flag,
        rules: [rule({ mode: 'on' }), { ...selfOn, mode: 'off' }],
      })
    ).toMatchObject({ enabled: false, source: 'self-opt-out' });
  });

  it('forces a kill switch off regardless of lower rules', () => {
    const decision = evaluateRuntimeFlag({
      context: member,
      flag: runtimeFlag({ kind: 'kill-switch' }),
      rules: [
        rule({ mode: 'off' }),
        rule({ scope: 'workspace', subjectId: WS, mode: 'on' }),
        rule({ scope: 'user', subjectId: USER, mode: 'on' }),
      ],
    });
    expect(decision).toMatchObject({ enabled: false, source: 'kill-switch' });
  });

  it('admits staff only for a staff rule', () => {
    const flag = runtimeFlag();
    const rules = [rule({ mode: 'staff' })];
    expect(evaluateRuntimeFlag({ context: member, flag, rules }).enabled).toBe(
      false
    );
    expect(
      evaluateRuntimeFlag({
        context: { ...member, isStaff: true },
        flag,
        rules,
      }).enabled
    ).toBe(true);
  });

  it('rolls out by allow-list and by deterministic percentage', () => {
    const flag = runtimeFlag();
    const allow = rule({
      mode: 'rollout',
      percentage: 0,
      allowWorkspaceIds: [WS],
    });
    expect(
      evaluateRuntimeFlag({ context: member, flag, rules: [allow] }).enabled
    ).toBe(true);
    expect(
      evaluateRuntimeFlag({
        context: { ...member, workspaceId: OTHER_WS },
        flag,
        rules: [allow],
      }).enabled
    ).toBe(false);
    const all = rule({ mode: 'rollout', percentage: 100 });
    expect(
      evaluateRuntimeFlag({ context: member, flag, rules: [all] }).enabled
    ).toBe(true);
    expect(
      evaluateRuntimeFlag({
        context: { ...member, userId: null },
        flag,
        rules: [all],
      }).enabled
    ).toBe(false);
  });

  it.each([
    ['a platform rule with a subject', { scope: 'platform', subjectId: WS }],
    ['a staff user rule', { scope: 'user', subjectId: USER, mode: 'staff' }],
    ['an out-of-range rollout', { mode: 'rollout', percentage: 101 }],
    ['an unknown mode', { mode: 'maybe' as never }],
    [
      'a string allow-list',
      {
        mode: 'rollout',
        percentage: 0,
        allowWorkspaceIds: WS as unknown as string[],
      },
    ],
  ] as const)('fails closed on %s, even with the env var on', (_, partial) => {
    const decision = evaluateRuntimeFlag({
      context: member,
      envValue: 'true',
      flag: runtimeFlag(),
      rules: [rule(partial as Partial<RuntimeRule>)],
    });
    expect(decision).toMatchObject({ enabled: false, source: 'invalid-rules' });
  });

  it('fails closed on duplicate rules for one subject', () => {
    const decision = evaluateRuntimeFlag({
      context: member,
      flag: runtimeFlag({ kind: 'kill-switch' }),
      rules: [rule({ mode: 'on' }), rule({ mode: 'off' })],
    });
    expect(decision).toMatchObject({ enabled: false, source: 'invalid-rules' });
  });

  it('ignores rules for other flags', () => {
    const decision = evaluateRuntimeFlag({
      context: member,
      flag: runtimeFlag(),
      rules: [rule({ flagKey: 'OTHER', mode: 'on' })],
    });
    expect(decision).toMatchObject({ enabled: false, source: 'default' });
  });

  it('keeps a workspace-admin rule below a platform off', () => {
    const flag = runtimeFlag({
      runtime: {
        type: 'boolean',
        scopes: ['platform', 'workspace'],
        controllers: {
          platform: 'platform-admin',
          workspace: 'workspace-admin',
        },
        envFallback: null,
        clientExposed: false,
      },
    });
    const optIn = rule({ scope: 'workspace', subjectId: WS, mode: 'on' });
    expect(
      evaluateRuntimeFlag({
        context: member,
        flag,
        rules: [rule({ mode: 'off' }), optIn],
      })
    ).toMatchObject({ enabled: false, source: 'platform' });
    expect(
      evaluateRuntimeFlag({
        context: member,
        flag,
        rules: [rule({ mode: 'staff' }), optIn],
      })
    ).toMatchObject({ enabled: true, source: 'workspace' });
  });

  it('uses the env fallback with no snapshot only until a platform rule exists', () => {
    const flag = runtimeFlag();
    expect(
      evaluateRuntimeFlag({
        context: member,
        envValue: 'true',
        flag,
        rules: null,
      })
    ).toMatchObject({ enabled: true, source: 'env-fallback' });
    // A workspace rule for another workspace does not suppress the fallback.
    expect(
      evaluateRuntimeFlag({
        context: member,
        envValue: 'true',
        flag,
        rules: [rule({ scope: 'workspace', subjectId: OTHER_WS, mode: 'off' })],
      })
    ).toMatchObject({ enabled: true, source: 'env-fallback' });
  });

  it('ignores the environment once the flag drops its fallback', () => {
    const flag = runtimeFlag({
      runtime: {
        type: 'boolean',
        scopes: ['platform'],
        controllers: { platform: 'platform-admin' },
        envFallback: null,
        clientExposed: false,
      },
    });
    expect(
      evaluateRuntimeFlag({
        context: member,
        envValue: 'true',
        flag,
        rules: null,
      })
    ).toMatchObject({ enabled: false, source: 'default' });
  });

  it('fails closed on a malformed snapshot', () => {
    for (const rules of [
      'on' as unknown as RuntimeRule[],
      [null as unknown as RuntimeRule],
    ]) {
      expect(
        evaluateRuntimeFlag({
          context: member,
          envValue: 'true',
          flag: runtimeFlag(),
          rules,
        })
      ).toMatchObject({ enabled: false, source: 'invalid-rules' });
    }
  });

  it('ignores a workspace rule when the actor has no workspace', () => {
    const decision = evaluateRuntimeFlag({
      context: { ...member, workspaceId: null },
      flag: runtimeFlag(),
      rules: [rule({ scope: 'workspace', subjectId: WS, mode: 'on' })],
    });
    expect(decision.enabled).toBe(false);
  });

  it('keeps rollout buckets stable and monotonic in the percentage', () => {
    const bucket = rolloutBucket('TEST_RUNTIME_FLAG', USER, WS);
    expect(rolloutBucket('TEST_RUNTIME_FLAG', USER, WS)).toBe(bucket);
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(10000);
    const flag = runtimeFlag();
    let seenOn = false;
    for (let percentage = 0; percentage <= 100; percentage += 1) {
      const enabled = evaluateRuntimeFlag({
        context: member,
        flag,
        rules: [rule({ mode: 'rollout', percentage })],
      }).enabled;
      if (seenOn) expect(enabled, `${percentage}%`).toBe(true);
      seenOn ||= enabled;
    }
    expect(seenOn).toBe(true);
  });
});
