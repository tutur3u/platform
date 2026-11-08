import {
  type FeatureFlagCatalog,
  type FlagEnvironment,
  type FlagFamily,
  type FlagKind,
  type FlagLifecycle,
  type FlagScope,
  featureFlagCatalog,
  getFlagLifecycle,
} from '@tuturuuu/feature-flags';

/**
 * Effective state requires an override/evaluation store this page does not
 * read, so every environment reports `unknown` instead of echoing defaults.
 */
export interface FeatureFlagEnvironmentState {
  declaredDefault: boolean;
  effective: 'unknown';
  environment: FlagEnvironment;
}

export interface FeatureFlagRow {
  apps: readonly string[];
  appsComplete: boolean;
  createdAt: string | null;
  description: string | null;
  environments: FeatureFlagEnvironmentState[];
  key: string;
  kind: FlagKind;
  legacy: boolean;
  lifecycle: FlagLifecycle;
  owner: string | null;
  scope: FlagScope;
  verifiedOnProdAt: string | null;
}

export interface FeatureFlagFamilyGroup {
  family: FlagFamily;
  rows: FeatureFlagRow[];
}

export interface FeatureFlagDashboardModel {
  environments: readonly FlagEnvironment[];
  groups: FeatureFlagFamilyGroup[];
  summary: {
    awaitingVerification: number;
    legacy: number;
    overdue: number;
    scheduled: number;
    total: number;
  };
}

export function buildFeatureFlagDashboardModel(
  now: Date,
  catalog: FeatureFlagCatalog = featureFlagCatalog
): FeatureFlagDashboardModel {
  const groups = new Map<FlagFamily, FeatureFlagRow[]>();

  for (const flag of catalog.flags) {
    const row: FeatureFlagRow = {
      apps: flag.apps,
      appsComplete: flag.appsComplete,
      createdAt: flag.createdAt,
      description: flag.description,
      environments: catalog.environments.map((environment) => ({
        declaredDefault: flag.defaults[environment],
        effective: 'unknown',
        environment,
      })),
      key: flag.key,
      kind: flag.kind,
      legacy: flag.legacy,
      lifecycle: getFlagLifecycle(flag, now),
      owner: flag.owner,
      scope: flag.scope,
      verifiedOnProdAt: flag.verifiedOnProdAt,
    };
    groups.set(flag.family, [...(groups.get(flag.family) ?? []), row]);
  }

  const rows = [...groups.values()].flat();
  const count = (status: FlagLifecycle['status']) =>
    rows.filter((row) => row.lifecycle.status === status).length;

  return {
    environments: catalog.environments,
    groups: [...groups].map(([family, familyRows]) => ({
      family,
      rows: familyRows,
    })),
    summary: {
      awaitingVerification: count('awaiting-verification'),
      legacy: rows.filter((row) => row.legacy).length,
      overdue: count('overdue'),
      scheduled: count('scheduled'),
      total: rows.length,
    },
  };
}
