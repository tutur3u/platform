import { featureFlagCatalog } from '@tuturuuu/feature-flags';
import { describe, expect, it } from 'vitest';
import { buildFeatureFlagDashboardModel } from './read-model';

const now = new Date('2026-11-09T00:00:00Z');

describe('feature flag dashboard storage', () => {
  it('leaves every environment unknown when storage is omitted or unavailable', () => {
    for (const storage of [undefined, { status: 'unavailable' as const }]) {
      const model = buildFeatureFlagDashboardModel(
        now,
        featureFlagCatalog,
        storage
      );
      expect(model.summary.total).toBe(featureFlagCatalog.flags.length);
      expect(
        model.groups.every((group) =>
          group.rows.every((row) =>
            row.environments.every((state) => state.effective === 'unknown')
          )
        )
      ).toBe(true);
    }
  });

  it('gates runtime overrides and does not project read-only families', () => {
    const model = buildFeatureFlagDashboardModel(now, featureFlagCatalog, {
      overrides: [
        {
          environment: 'production',
          flagKey: 'mobile_offline',
          overrideEnabled: false,
          revision: 2,
        },
        {
          environment: 'production',
          flagKey: 'offline_read_notes',
          overrideEnabled: true,
          revision: 3,
        },
        {
          environment: 'production',
          flagKey: 'ENABLE_AI',
          overrideEnabled: true,
          revision: 8,
        },
      ],
      status: 'ready',
    });
    const runtime = model.groups.find(
      (group) => group.family === 'mobile-runtime'
    );
    const notes = runtime?.rows.find((row) => row.key === 'offline_read_notes');
    const master = runtime?.rows.find((row) => row.key === 'mobile_offline');
    const secret = model.groups
      .find((group) => group.family === 'workspace-secret')
      ?.rows.find((row) => row.key === 'ENABLE_AI');
    const build = model.groups.find((group) => group.family === 'mobile-build')
      ?.rows[0];
    expect(notes?.mutable).toBe(true);
    expect(
      notes?.environments.find((state) => state.environment === 'production')
    ).toMatchObject({ effective: 'off', overrideEnabled: true, revision: 3 });
    expect(
      master?.environments.find((state) => state.environment === 'development')
    ).toMatchObject({ effective: 'off', overrideEnabled: null, revision: 0 });
    expect(secret).toMatchObject({
      mutable: false,
      readOnly: 'workspace-secret',
    });
    expect(
      secret?.environments.every((state) => state.effective === 'unknown')
    ).toBe(true);
    expect(build?.readOnly).toBe('mobile-build');
    expect(
      build?.environments.every((state) => state.effective === 'unknown')
    ).toBe(true);
  });
});

it('projects rollout metadata without inventing legacy stages', () => {
  const first = featureFlagCatalog.flags[0];
  if (!first) throw new Error('catalog fixture missing');
  const model = buildFeatureFlagDashboardModel(now, {
    ...featureFlagCatalog,
    flags: [
      {
        ...first,
        rollout: {
          stage: 'internal',
          owner: 'platform',
          removeBy: '2026-11-11',
        },
      },
      ...featureFlagCatalog.flags.slice(1),
    ],
  });
  const rows = model.groups.flatMap((group) => group.rows);
  expect(rows).toHaveLength(52);
  expect(rows.map((row) => row.key).sort()).toEqual(
    featureFlagCatalog.flags.map((flag) => flag.key).sort()
  );
  expect(rows.find((row) => row.key === first.key)).toMatchObject({
    owner: 'platform',
    rollout: { stage: 'internal', removeBy: '2026-11-11' },
  });
  expect(
    rows.find((row) => row.key === featureFlagCatalog.flags[1]?.key)?.rollout
  ).toBeUndefined();
});
