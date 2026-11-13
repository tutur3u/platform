import { describe, expect, it } from 'vitest';
import {
  isFeatureEnabled,
  isInternalFeatureAudience,
  validateFeatureRollout,
} from './audience.mjs';
import type { FeatureAudienceUser, FeatureRollout } from './audience.mjs';
import { evaluateFlags, featureFlagCatalog, registry } from './index';

const user = {
  id: 'verified-actor',
  email: 'Staff@TUTURUUU.COM',
  email_confirmed_at: '2026-11-09T00:00:00Z',
};
const metadata = { owner: 'platform', removeBy: '2026-11-11' };
const internal = { ...metadata, stage: 'internal' } satisfies FeatureRollout;
const context = {
  user,
  workspace: { id: 'workspace-a' },
  permissionGranted: true,
};
const enabled = (
  policy: FeatureRollout,
  actor: FeatureAudienceUser | null = user,
  permissionGranted = true
) =>
  isFeatureEnabled(
    'offline_read_notes',
    { ...context, user: actor, permissionGranted },
    {
      enabledFlags: { offline_read_notes: true },
      rollouts: { offline_read_notes: policy },
    }
  );

describe('server feature audience', () => {
  it('admits only verified exact internal domains by default', () => {
    expect(enabled(internal)).toBe(true);
    for (const email of [
      'x@tuturuuu.com.evil.test',
      'x@sub.tuturuuu.com',
      'x@evil-tuturuuu.com',
      'x@@tuturuuu.com',
      ' x@tuturuuu.com',
      'x@tuturuuu.com ',
    ])
      expect(enabled(internal, { ...user, email })).toBe(false);
    for (const actor of [
      null,
      { ...user, email: null },
      { ...user, email_confirmed_at: null },
      { ...user, email_confirmed_at: 'invalid' },
      { ...user, is_anonymous: true },
      { ...user, id: '' },
    ])
      expect(enabled(internal, actor)).toBe(false);
  });
  it('supports explicit allowlists without treating an empty list as the default', () => {
    expect(
      isInternalFeatureAudience({ ...user, email: 'x@example.org' }, [
        'EXAMPLE.ORG',
      ])
    ).toBe(true);
    expect(isInternalFeatureAudience(user, [])).toBe(false);
    expect(isInternalFeatureAudience(user, ['tuturuuu.com '])).toBe(false);
  });
  it('never grants permissions or enables OFF, unknown or unconfigured flags', () => {
    expect(enabled(internal, user, false)).toBe(false);
    expect(
      isFeatureEnabled('x', context, {
        enabledFlags: { x: false },
        rollouts: { x: internal },
      })
    ).toBe(false);
    expect(
      isFeatureEnabled('x', context, {
        enabledFlags: { x: true },
        rollouts: {},
      })
    ).toBe(false);
    expect(
      isFeatureEnabled('toString', context, { enabledFlags: {}, rollouts: {} })
    ).toBe(false);
  });
  it('rolls out only to selected workspaces', () => {
    const policy = {
      ...metadata,
      stage: 'rollout',
      audience: { kind: 'workspaces', workspaceIds: ['workspace-a'] },
    } satisfies FeatureRollout;
    expect(enabled(policy)).toBe(true);
    expect(
      isFeatureEnabled(
        'offline_read_notes',
        { ...context, workspace: { id: 'workspace-b' } },
        {
          enabledFlags: { offline_read_notes: true },
          rollouts: { offline_read_notes: policy },
        }
      )
    ).toBe(false);
    expect(enabled(policy, null)).toBe(false);
  });
  it('has stable percentage assignments and exact zero/full boundaries', () => {
    const policy = (percentage: number): FeatureRollout => ({
      ...metadata,
      stage: 'rollout',
      audience: { kind: 'percentage', percentage },
    });
    expect(enabled(policy(0))).toBe(false);
    expect(enabled(policy(100))).toBe(true);
    expect(Array.from({ length: 10 }, () => enabled(policy(50)))).toEqual(
      Array(10).fill(enabled(policy(50)))
    );
    expect(enabled(policy(-1))).toBe(false);
    expect(enabled(policy(101))).toBe(false);
    expect(enabled(policy(1.5))).toBe(false);
  });
  it('retains identity, permission and enablement gates at GA', () => {
    const policy = { ...metadata, stage: 'ga' } satisfies FeatureRollout;
    expect(
      [null, { ...user, id: '' }, { ...user, is_anonymous: true }].map(
        (actor) => enabled(policy, actor)
      )
    ).toEqual([false, false, false]);
    expect(enabled(policy, user)).toBe(true);
    expect(enabled(policy, user, false)).toBe(false);
  });
  it('requires lifecycle ownership and a real removal date', () => {
    for (const value of [
      null,
      {},
      { ...internal, owner: '' },
      { ...internal, removeBy: '2026-02-30' },
      { ...internal, stage: 'unknown' },
      { ...internal, emailDomainAllowlist: ['*.tuturuuu.com'] },
    ])
      expect(validateFeatureRollout(value).length).toBeGreaterThan(0);
    expect(validateFeatureRollout(internal)).toEqual([]);
  });
  it('does not mutate the 53-entry catalog or 17-key mobile evaluator', () => {
    expect(featureFlagCatalog.flags).toHaveLength(53);
    expect(registry).toHaveLength(17);
    const catalogBefore = structuredClone(featureFlagCatalog);
    const before = evaluateFlags(registry, {});
    enabled(internal);
    expect(evaluateFlags(registry, {})).toEqual(before);
    expect(featureFlagCatalog).toEqual(catalogBefore);
  });
});
