import { describe, expect, it } from 'vitest';
import committedCatalog from '../../../config/feature-flag-catalog.json';
import {
  type CatalogFlag,
  deriveRemoveBy,
  type FeatureFlagCatalog,
  findOverdueFlags,
  getFlagLifecycle,
  validateCatalog,
  validateFlag,
} from './lifecycle.mjs';

const completeFlag: CatalogFlag = {
  key: 'new_feature',
  family: 'mobile-runtime',
  kind: 'release',
  scope: 'global',
  description: 'Gate a new feature.',
  owner: 'owner',
  rollout: { stage: 'internal', owner: 'owner', removeBy: '2026-11-11' },
  createdAt: '2026-11-01',
  apps: ['web'],
  appsComplete: true,
  sources: ['config/feature-flags.json'],
  defaults: { development: false, staging: false, production: false },
  verifiedOnProdAt: null,
  legacy: false,
};

describe('deriveRemoveBy', () => {
  it('returns null until production verification is recorded', () => {
    expect(deriveRemoveBy(null)).toBeNull();
    expect(deriveRemoveBy(undefined)).toBeNull();
  });

  it('adds exactly 48 hours to the verification instant', () => {
    expect(deriveRemoveBy('2026-11-08T04:00:00Z')).toBe(
      '2026-11-10T04:00:00.000Z'
    );
    expect(deriveRemoveBy('2026-11-08T11:00:00+07:00')).toBe(
      '2026-11-10T04:00:00.000Z'
    );
  });

  it('rejects malformed or date-only verification values', () => {
    expect(deriveRemoveBy('2026-11-08')).toBeNull();
    expect(deriveRemoveBy('not-a-date')).toBeNull();
    expect(deriveRemoveBy('2026-02-30T00:00:00Z')).toBeNull();
  });
});

describe('getFlagLifecycle', () => {
  const verified = {
    ...completeFlag,
    verifiedOnProdAt: '2026-11-08T04:00:00Z',
  };

  it('waits for verification on unverified release flags', () => {
    expect(getFlagLifecycle(completeFlag, '2030-01-01T00:00:00Z')).toEqual({
      removeBy: null,
      removeBySource: null,
      status: 'awaiting-verification',
    });
  });

  it('is scheduled through the 48-hour boundary and overdue after it', () => {
    expect(getFlagLifecycle(verified, '2026-11-10T04:00:00.000Z').status).toBe(
      'scheduled'
    );
    expect(getFlagLifecycle(verified, '2026-11-10T04:00:00.001Z')).toEqual({
      removeBy: '2026-11-10T04:00:00.000Z',
      removeBySource: 'verified',
      status: 'overdue',
    });
  });

  it('never makes retained controls removal-due from verification', () => {
    for (const kind of [
      'kill-switch',
      'workspace-gate',
      'safety-control',
      'operational',
    ] as const) {
      expect(
        getFlagLifecycle({ ...verified, kind }, '2030-01-01T00:00:00Z')
      ).toEqual({ removeBy: null, removeBySource: null, status: 'retained' });
    }
  });

  it('ignores legacy and verified deadlines on retained controls', () => {
    const retained = [
      'kill-switch',
      'workspace-gate',
      'safety-control',
      'operational',
    ] as const;
    const flags = retained.map((kind) => ({
      ...verified,
      key: kind.replaceAll('-', '_'),
      kind,
      legacy: true,
      legacyRemoveBy: '2026-11-01',
    }));
    for (const flag of flags) {
      expect(getFlagLifecycle(flag, '2030-01-01T00:00:00Z')).toEqual({
        removeBy: null,
        removeBySource: null,
        status: 'retained',
      });
    }
    const catalog: FeatureFlagCatalog = {
      environments: ['development', 'staging', 'production'],
      flags: [...flags, { ...verified, key: 'due_release' }],
    };
    expect(
      findOverdueFlags(catalog, '2030-01-01T00:00:00Z').map(
        ({ flag }) => flag.key
      )
    ).toEqual(['due_release']);
  });

  it('keeps the committed mobile_offline kill switch retained', () => {
    const catalog = committedCatalog as FeatureFlagCatalog;
    const killSwitch = catalog.flags.find(
      (flag) => flag.key === 'mobile_offline'
    );
    expect(killSwitch).toMatchObject({
      kind: 'kill-switch',
      legacyRemoveBy: '2027-01-31',
    });
    expect(getFlagLifecycle(killSwitch!, '2027-02-01T00:00:00Z')).toEqual({
      removeBy: null,
      removeBySource: null,
      status: 'retained',
    });
    const overdue = findOverdueFlags(catalog, '2027-02-01T00:00:00Z').map(
      ({ flag }) => flag.key
    );
    expect(overdue).not.toContain('mobile_offline');
    expect(overdue).toHaveLength(
      catalog.flags.filter(
        (flag) => flag.kind === 'release' && flag.legacyRemoveBy
      ).length
    );
  });

  it('honours a legacy date through the end of that UTC day', () => {
    const legacy = {
      ...completeFlag,
      legacy: true,
      legacyRemoveBy: '2027-01-31',
    };
    expect(getFlagLifecycle(legacy, '2027-01-31T23:59:59.999Z').status).toBe(
      'scheduled'
    );
    expect(getFlagLifecycle(legacy, '2027-02-01T00:00:00.000Z')).toEqual({
      removeBy: '2027-01-31T23:59:59.999Z',
      removeBySource: 'legacy',
      status: 'overdue',
    });
  });

  it('prefers the verification deadline over a legacy date', () => {
    const both = { ...verified, legacy: true, legacyRemoveBy: '2027-01-31' };
    expect(getFlagLifecycle(both, '2026-11-09T00:00:00Z')).toMatchObject({
      removeBy: '2026-11-10T04:00:00.000Z',
      removeBySource: 'verified',
    });
  });
});

describe('validateFlag', () => {
  it('accepts complete metadata for a new flag', () => {
    expect(validateFlag(completeFlag)).toEqual([]);
  });

  it('requires complete metadata on new flags', () => {
    const errors = validateFlag({
      ...completeFlag,
      owner: null,
      createdAt: null,
      description: null,
      apps: [],
      appsComplete: false,
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'new_feature: new flags require an owner',
        'new_feature: new flags require createdAt',
        'new_feature: new flags require a description',
        'new_feature: new flags require at least one app',
        'new_feature: new flags require a complete app list',
      ])
    );
  });

  it('allows explicit unknowns only on legacy entries', () => {
    expect(
      validateFlag({
        ...completeFlag,
        legacy: true,
        owner: null,
        createdAt: null,
        description: null,
        apps: [],
        appsComplete: false,
      })
    ).toEqual([]);
  });

  it('rejects malformed values', () => {
    const errors = validateFlag({
      ...completeFlag,
      kind: 'temporary',
      createdAt: '2026-13-01',
      verifiedOnProdAt: '2026-11-08',
      defaults: { development: false, production: 'false' },
      sources: [],
      legacyRemoveBy: '2027-01-31',
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'new_feature: kind is invalid',
        'new_feature: createdAt must be a YYYY-MM-DD date or null',
        'new_feature: verifiedOnProdAt must be an ISO instant with an offset or null',
        'new_feature: defaults must map every environment to a boolean',
        'new_feature: sources must list at least one repository path',
        'new_feature: new flags derive removeBy from verifiedOnProdAt',
      ])
    );
  });

  it('rejects verification recorded before creation', () => {
    expect(
      validateFlag({
        ...completeFlag,
        verifiedOnProdAt: '2026-10-01T00:00:00Z',
      })
    ).toEqual(['new_feature: verifiedOnProdAt precedes createdAt']);
  });
});

describe('validateCatalog', () => {
  it('rejects duplicate keys within a family and unknown environments', () => {
    expect(
      validateCatalog({
        environments: ['production'],
        flags: [completeFlag, completeFlag],
      })
    ).toEqual([
      'environments must equal development, staging, production',
      'new_feature: duplicate entry',
    ]);
  });
});

it('requires rollout metadata for new release flags while preserving legacy entries', () => {
  expect(validateFlag({ ...completeFlag, rollout: undefined })).toContain(
    'new_feature: new release flags require rollout stage, owner and removeBy'
  );
  expect(
    validateFlag({
      ...completeFlag,
      rollout: { stage: 'internal', owner: '', removeBy: 'invalid' },
    })
  ).toEqual(
    expect.arrayContaining([
      'new_feature: owner is required',
      'new_feature: removeBy must be a calendar date',
    ])
  );
});
