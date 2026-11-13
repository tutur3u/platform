import { describe, expect, it } from 'vitest';
import { evaluateFlags, registry } from './index';
import { projectDashboardFlag } from './runtime-dashboard';

const registryKeys = registry.map((flag) => flag.key);

function evaluated(overrides: Record<string, boolean>) {
  return evaluateFlags(registry, {}, overrides);
}

describe('dashboard flag projection', () => {
  it('keeps an unavailable store unknown instead of a persisted off', () => {
    expect(
      projectDashboardFlag({
        evaluated: false,
        family: 'mobile-runtime',
        flagKey: 'mobile_offline',
        registryKeys,
        storageReady: false,
        stored: { overrideEnabled: false, revision: 4 },
      })
    ).toEqual({
      effective: 'unknown',
      mutable: false,
      overrideEnabled: null,
      readOnly: null,
      revision: 0,
    });
  });

  it('applies the master gate only to registry runtime keys', () => {
    const flags = evaluated({
      mobile_offline: false,
      offline_read_notes: true,
    });
    expect(
      projectDashboardFlag({
        evaluated: flags.offline_read_notes,
        family: 'mobile-runtime',
        flagKey: 'offline_read_notes',
        registryKeys,
        storageReady: true,
        stored: { overrideEnabled: true, revision: 3 },
      })
    ).toMatchObject({ effective: 'off', mutable: true, revision: 3 });
    const open = evaluated({
      mobile_offline: true,
      offline_read_notes: true,
    });
    expect(open.offline_read_notes).toBe(true);
    expect(
      projectDashboardFlag({
        evaluated: true,
        family: 'mobile-runtime',
        flagKey: 'verified_release',
        registryKeys,
        storageReady: true,
        stored: { overrideEnabled: true, revision: 9 },
      }).effective
    ).toBe('unknown');
  });

  it('marks both read-only families and ignores forged stored values', () => {
    expect(
      projectDashboardFlag({
        evaluated: true,
        family: 'workspace-secret',
        flagKey: 'ENABLE_AI',
        registryKeys,
        storageReady: true,
        stored: { overrideEnabled: true, revision: 1 },
      })
    ).toMatchObject({
      effective: 'unknown',
      mutable: false,
      readOnly: 'workspace-secret',
    });
    expect(
      projectDashboardFlag({
        evaluated: undefined,
        family: 'mobile-build',
        flagKey: 'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED',
        registryKeys,
        storageReady: true,
        stored: null,
      }).readOnly
    ).toBe('mobile-build');
  });
});
