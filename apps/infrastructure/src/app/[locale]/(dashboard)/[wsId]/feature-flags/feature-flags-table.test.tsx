// @vitest-environment jsdom
import type { CatalogFlag, FeatureFlagCatalog } from '@tuturuuu/feature-flags';
import { featureFlagCatalog } from '@tuturuuu/feature-flags';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeatureFlagsTable } from './feature-flags-table';
import { buildFeatureFlagDashboardModel } from './read-model';

const t = (key: string) => key;
const base: CatalogFlag = {
  key: 'verified_release',
  family: 'mobile-runtime',
  kind: 'release',
  scope: 'global',
  description: 'Verified release.',
  owner: 'owner',
  createdAt: '2026-11-01',
  apps: ['web'],
  appsComplete: true,
  sources: ['config/feature-flags.json'],
  defaults: { development: true, staging: false, production: false },
  verifiedOnProdAt: '2026-11-08T04:00:00Z',
  legacy: false,
};
const fixture: FeatureFlagCatalog = {
  environments: ['development', 'staging', 'production'],
  flags: [
    base,
    {
      ...base,
      key: 'legacy_gate',
      family: 'workspace-secret',
      kind: 'safety-control',
      scope: 'workspace',
      description: null,
      owner: null,
      createdAt: null,
      apps: [],
      appsComplete: false,
      verifiedOnProdAt: null,
      legacy: true,
    },
  ],
};

function renderGroups(now: string, catalog = fixture) {
  const model = buildFeatureFlagDashboardModel(new Date(now), catalog);
  return {
    model,
    ...render(
      <>
        {model.groups.map((group) => (
          <FeatureFlagsTable group={group} key={group.family} t={t} />
        ))}
      </>
    ),
  };
}

const row = (key: string) =>
  document.querySelector(`[data-flag-key="${key}"]`) as HTMLElement;

describe('feature flags read model and table', () => {
  it('groups flags by family and summarizes lifecycle states', () => {
    const { model } = renderGroups('2026-11-10T04:00:01Z');
    expect(model.groups.map((group) => group.family)).toEqual([
      'mobile-runtime',
      'workspace-secret',
    ]);
    expect(model.summary).toEqual({
      awaitingVerification: 0,
      legacy: 1,
      overdue: 1,
      scheduled: 0,
      total: 2,
    });
    expect(
      screen.getByRole('table', { name: 'families.workspace_secret' })
    ).toBeInTheDocument();
  });

  it('shows declared defaults beside an unknown effective state', () => {
    renderGroups('2026-11-09T00:00:00Z');
    const cells = within(row('verified_release'));
    expect(cells.getAllByText('values.unknown')).toHaveLength(3);
    expect(cells.getByText('values.default_on')).toBeInTheDocument();
    expect(cells.getAllByText('values.default_off')).toHaveLength(2);
    expect(cells.getByText('lifecycle.scheduled')).toBeInTheDocument();
    expect(cells.getByText('2026-11-10 04:00 UTC')).toBeInTheDocument();
  });

  it('renders offset verification instants in UTC', () => {
    renderGroups('2026-11-09T00:00:00Z', {
      ...fixture,
      flags: [{ ...base, verifiedOnProdAt: '2026-11-08T11:00:00+07:00' }],
    });
    const verified = within(row('verified_release')).getByText(
      '2026-11-08 04:00 UTC'
    );
    expect(verified).toHaveAttribute('datetime', '2026-11-08T11:00:00+07:00');
    expect(
      within(row('verified_release')).getByText('2026-11-10 04:00 UTC')
    ).toBeInTheDocument();
    expect(screen.queryByText('2026-11-08 11:00 UTC')).not.toBeInTheDocument();
  });

  it('marks overdue releases and never labels legacy gaps as verified', () => {
    renderGroups('2026-11-10T04:00:01Z');
    expect(
      within(row('verified_release')).getByText('lifecycle.overdue')
    ).toBeInTheDocument();
    const legacy = within(row('legacy_gate'));
    expect(legacy.getAllByText('values.legacy_unknown')).toHaveLength(2);
    expect(legacy.getByText('values.not_verified')).toBeInTheDocument();
    expect(legacy.getByText('values.untraced')).toBeInTheDocument();
    expect(legacy.getByText('lifecycle.retained')).toBeInTheDocument();
    expect(legacy.getByText('kinds.safety_control')).toBeInTheDocument();
  });

  it('renders the committed catalog with unknown effective state everywhere', () => {
    const { container } = renderGroups(
      '2026-11-08T00:00:00Z',
      featureFlagCatalog
    );
    const rows = container.querySelectorAll('[data-flag-key]');
    expect(rows).toHaveLength(featureFlagCatalog.flags.length);
    expect(screen.getAllByText('values.unknown')).toHaveLength(
      featureFlagCatalog.flags.length * featureFlagCatalog.environments.length
    );
    expect(screen.getAllByText('values.not_verified')).toHaveLength(
      featureFlagCatalog.flags.length
    );
    expect(screen.queryByText('lifecycle.overdue')).not.toBeInTheDocument();
  });
});
