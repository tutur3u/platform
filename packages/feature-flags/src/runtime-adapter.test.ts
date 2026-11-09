import { describe, expect, it } from 'vitest';
import { evaluateFlags, registry } from './index';
import {
  classifyStoreFailure,
  planMobileFeatureFlags,
  selectRuntimeOverrides,
} from './runtime-adapter';
import { resolveRuntimeFlagEnvironment } from './runtime-environment';

const keys = registry.map((flag) => flag.key);

describe('runtime override selection', () => {
  it('keeps authorization denial distinct from a default fallback', () => {
    expect(
      selectRuntimeOverrides({ keys, store: { status: 'denied' } }).kind
    ).toBe('denied');
    expect(
      selectRuntimeOverrides({ keys, store: { status: 'invalid' } }).kind
    ).toBe('invalid');
    expect(
      selectRuntimeOverrides({ keys, store: { status: 'unreachable' } }).kind
    ).toBe('defaults');
  });

  it('ignores tombstones, unknown keys, and read-only rows', () => {
    const selected = selectRuntimeOverrides({
      keys,
      store: {
        status: 'ready',
        overrides: [
          { flagKey: 'mobile_offline', overrideEnabled: true, revision: 2 },
          { flagKey: 'offline_read_notes', overrideEnabled: null, revision: 4 },
          { flagKey: 'ENABLE_AI', overrideEnabled: true, revision: 1 },
          {
            flagKey: 'cookie_consent_banner',
            overrideEnabled: true,
            revision: 1,
          },
        ],
      },
    });
    expect(selected).toEqual({
      kind: 'overrides',
      overrides: { mobile_offline: true },
    });
    if (selected.kind !== 'overrides') return;
    const flags = evaluateFlags(registry, {}, selected.overrides);
    expect(flags.mobile_offline).toBe(true);
    expect(flags.offline_read_notes).toBe(false);
  });

  it('does not read storage for an unauthorized mobile caller', async () => {
    const plan = await planMobileFeatureFlags({
      authOk: false,
      keys,
      load: async () => {
        throw new Error('storage was read');
      },
    });
    expect(plan).toEqual({ readStore: false, outcome: 'unauthorized' });
  });

  it('classifies permission failures separately from an unreachable store', () => {
    expect(classifyStoreFailure({ code: '42501', message: 'denied' })).toBe(
      'denied'
    );
    expect(
      classifyStoreFailure({ message: 'platform_feature_flag_denied' })
    ).toBe('denied');
    expect(classifyStoreFailure({ code: 'PGRST202', message: 'missing' })).toBe(
      'unreachable'
    );
    expect(classifyStoreFailure({ message: 'fetch failed' })).toBe(
      'unreachable'
    );
  });
});

describe('server environment selection', () => {
  it('maps preview to staging and fails closed to production', () => {
    expect(
      resolveRuntimeFlagEnvironment({
        vercelEnv: 'preview',
        nodeEnv: 'production',
      })
    ).toBe('staging');
    expect(
      resolveRuntimeFlagEnvironment({
        vercelEnv: 'production',
        nodeEnv: 'test',
      })
    ).toBe('production');
    expect(
      resolveRuntimeFlagEnvironment({
        vercelEnv: 'something-else',
        nodeEnv: 'development',
      })
    ).toBe('production');
    expect(resolveRuntimeFlagEnvironment({ nodeEnv: 'test' })).toBe(
      'development'
    );
    expect(resolveRuntimeFlagEnvironment({ nodeEnv: 'production' })).toBe(
      'production'
    );
  });
});
