import { describe, expect, it } from 'vitest';
import type { CatalogFlag } from './lifecycle.mjs';
import type { RuntimeDefinition } from './runtime-definition.mjs';
import { validateRuntimeDefinition } from './runtime-definition.mjs';
import {
  evaluateRuntimeFlag,
  type RuntimeEvaluationContext,
  type RuntimeRule,
} from './runtime-evaluate';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';
const KEY = 'TEST_CEILING_FLAG';

function flagWith(runtime: Partial<RuntimeDefinition> = {}): CatalogFlag {
  return {
    key: KEY,
    family: 'runtime',
    kind: 'release',
    scope: 'global',
    description: 'Test flag.',
    owner: 'platform',
    createdAt: '2026-11-25',
    apps: ['web'],
    appsComplete: true,
    sources: ['packages/feature-flags/src/runtime-ceiling.test.ts'],
    defaults: { development: false, staging: false, production: false },
    verifiedOnProdAt: null,
    legacy: false,
    runtime: {
      type: 'boolean',
      scopes: ['platform', 'workspace', 'user'],
      controllers: {
        platform: 'platform-admin',
        workspace: 'workspace-admin',
        user: 'platform-admin',
      },
      envFallback: KEY,
      clientExposed: false,
      ...runtime,
    },
  };
}

const member: RuntimeEvaluationContext = {
  isStaff: false,
  userId: USER,
  workspaceId: WS,
};
const staff: RuntimeEvaluationContext = { ...member, isStaff: true };

function platformRule(partial: Partial<RuntimeRule> = {}): RuntimeRule {
  return {
    flagKey: KEY,
    scope: 'platform',
    subjectId: null,
    mode: 'on',
    ...partial,
  };
}
const workspaceOn: RuntimeRule = {
  flagKey: KEY,
  scope: 'workspace',
  subjectId: WS,
  mode: 'on',
};
const workspaceOff: RuntimeRule = { ...workspaceOn, mode: 'off' };
const userOn: RuntimeRule = {
  flagKey: KEY,
  scope: 'user',
  subjectId: USER,
  mode: 'on',
};

function decide(
  flag: CatalogFlag,
  rules: RuntimeRule[],
  context = member,
  envValue?: string
) {
  return evaluateRuntimeFlag({ context, envValue, flag, rules });
}

describe('platform rule ceiling', () => {
  it('workspace on vs platform staff → staff-only', () => {
    const rules = [platformRule({ mode: 'staff' }), workspaceOn];
    expect(decide(flagWith(), rules, member)).toMatchObject({
      enabled: false,
      source: 'platform',
    });
    expect(decide(flagWith(), rules, staff)).toMatchObject({
      enabled: true,
      source: 'workspace',
    });
  });

  it('bounds a workspace rule by a platform rollout', () => {
    const zero = platformRule({ mode: 'rollout', percentage: 0 });
    expect(decide(flagWith(), [zero, workspaceOn]).enabled).toBe(false);
    const allowed = platformRule({
      mode: 'rollout',
      percentage: 0,
      allowWorkspaceIds: [WS],
    });
    expect(decide(flagWith(), [allowed, workspaceOn])).toMatchObject({
      enabled: true,
      source: 'workspace',
    });
    expect(decide(flagWith(), [allowed, workspaceOff])).toMatchObject({
      enabled: false,
      source: 'workspace',
    });
  });

  it('lets a workspace rule only narrow a flag with no platform rule', () => {
    const flag = flagWith();
    expect(decide(flag, [workspaceOn])).toMatchObject({
      enabled: false,
      source: 'default',
    });
    expect(decide(flag, [workspaceOn], member, 'true')).toMatchObject({
      enabled: true,
      source: 'workspace',
    });
    expect(decide(flag, [workspaceOff], member, 'true')).toMatchObject({
      enabled: false,
      source: 'workspace',
    });
  });

  it('lets a delegated workspace rule enable while the platform is on or absent', () => {
    const flag = flagWith({ delegate: 'workspace' });
    expect(decide(flag, [workspaceOn])).toMatchObject({
      enabled: true,
      source: 'workspace',
    });
    expect(decide(flag, [platformRule(), workspaceOff]).enabled).toBe(false);
    expect(
      decide(flag, [platformRule({ mode: 'staff' }), workspaceOn], member)
    ).toMatchObject({ enabled: false, source: 'platform' });
    expect(
      decide(flag, [platformRule({ mode: 'off' }), workspaceOn])
    ).toMatchObject({ enabled: false, source: 'platform' });
  });

  it('bounds a platform-admin user rule unless the platform is on or absent', () => {
    const flag = flagWith();
    expect(decide(flag, [userOn])).toMatchObject({
      enabled: true,
      source: 'user',
    });
    expect(
      decide(flag, [platformRule({ mode: 'staff' }), userOn], member)
    ).toMatchObject({ enabled: false, source: 'platform' });
    expect(
      decide(flag, [platformRule({ mode: 'staff' }), userOn], staff)
    ).toMatchObject({ enabled: true, source: 'user' });
    const allowUser = platformRule({
      mode: 'rollout',
      percentage: 0,
      allowUserIds: [USER],
    });
    expect(decide(flag, [allowUser, userOn]).enabled).toBe(true);
    expect(
      decide(flag, [platformRule(), { ...userOn, mode: 'off' }]).enabled
    ).toBe(false);
  });

  it('applies a self opt-out inside the ceiling', () => {
    const flag = flagWith({
      controllers: {
        platform: 'platform-admin',
        workspace: 'workspace-admin',
        user: 'self',
      },
    });
    expect(
      decide(flag, [platformRule(), workspaceOn, { ...userOn, mode: 'off' }])
    ).toMatchObject({ enabled: false, source: 'self-opt-out' });
    expect(
      decide(flag, [platformRule({ mode: 'staff' }), userOn]).enabled
    ).toBe(false);
  });

  it('keeps a kill-switch platform off final', () => {
    const flag = {
      ...flagWith({ delegate: 'workspace' }),
      kind: 'kill-switch' as const,
    };
    expect(
      decide(flag, [platformRule({ mode: 'off' }), workspaceOn, userOn], staff)
    ).toMatchObject({ enabled: false, source: 'kill-switch' });
  });
});

describe('runtime delegate field', () => {
  const base = {
    type: 'boolean',
    scopes: ['platform', 'workspace'],
    controllers: { platform: 'platform-admin', workspace: 'workspace-admin' },
    envFallback: null,
    clientExposed: false,
  };

  it('accepts workspace delegation only with the workspace scope', () => {
    expect(
      validateRuntimeDefinition({ ...base, delegate: 'workspace' })
    ).toEqual([]);
    expect(
      validateRuntimeDefinition({
        ...base,
        scopes: ['platform'],
        controllers: { platform: 'platform-admin' },
        delegate: 'workspace',
      })
    ).toContain('runtime.delegate requires the workspace scope');
    expect(validateRuntimeDefinition({ ...base, delegate: 'user' })).toContain(
      'runtime.delegate must be workspace when set'
    );
    expect(validateRuntimeDefinition({ ...base, delegate: null })).toContain(
      'runtime.delegate must be workspace when set'
    );
  });
});
