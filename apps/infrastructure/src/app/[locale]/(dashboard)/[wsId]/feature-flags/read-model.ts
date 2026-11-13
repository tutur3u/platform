import {
  type FeatureFlagCatalog,
  type FlagEnvironment,
  type FlagFamily,
  type FlagKind,
  type FlagLifecycle,
  type FlagScope,
  evaluateFlags,
  featureFlagCatalog,
  getFlagLifecycle,
  projectDashboardFlag,
  registry,
  RUNTIME_FLAG_KEYS,
} from '@tuturuuu/feature-flags';

export interface FeatureFlagStoredOverride {
  environment: FlagEnvironment;
  flagKey: string;
  overrideEnabled: boolean | null;
  revision: number;
}

export type FeatureFlagStorageSnapshot =
  | { overrides: readonly FeatureFlagStoredOverride[]; status: 'ready' }
  | { status: 'unavailable' };

export interface FeatureFlagEnvironmentState {
  declaredDefault: boolean;
  effective: 'off' | 'on' | 'unknown';
  environment: FlagEnvironment;
  overrideEnabled: boolean | null;
  revision: number;
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
  mutable: boolean;
  owner: string | null;
  readOnly: 'mobile-build' | 'workspace-secret' | null;
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
  catalog: FeatureFlagCatalog = featureFlagCatalog,
  storage?: FeatureFlagStorageSnapshot
): FeatureFlagDashboardModel {
  const storageReady = storage?.status === 'ready';
  const readyOverrides = storage?.status === 'ready' ? storage.overrides : [];
  const evaluatedByEnvironment = new Map<
    FlagEnvironment,
    Record<string, boolean>
  >();
  if (storage?.status === 'ready') {
    for (const environment of catalog.environments) {
      const overrides: Record<string, boolean> = {};
      for (const row of storage.overrides) {
        if (row.environment !== environment) continue;
        if (!RUNTIME_FLAG_KEYS.some((key) => key === row.flagKey)) continue;
        if (typeof row.overrideEnabled !== 'boolean') continue;
        overrides[row.flagKey] = row.overrideEnabled;
      }
      evaluatedByEnvironment.set(
        environment,
        evaluateFlags(registry, {}, overrides)
      );
    }
  }

  const groups = new Map<FlagFamily, FeatureFlagRow[]>();
  for (const flag of catalog.flags) {
    const environments = catalog.environments.map((environment) => {
      const evaluated = evaluatedByEnvironment.get(environment)?.[flag.key];
      const stored =
        readyOverrides.find(
          (row) => row.flagKey === flag.key && row.environment === environment
        ) ?? null;
      const projection = projectDashboardFlag({
        evaluated,
        family: flag.family,
        flagKey: flag.key,
        registryKeys: RUNTIME_FLAG_KEYS,
        storageReady,
        stored,
      });
      return {
        declaredDefault: flag.defaults[environment],
        effective: projection.effective,
        environment,
        overrideEnabled: projection.overrideEnabled,
        revision: projection.revision,
      };
    });
    const readOnly = projectDashboardFlag({
      evaluated: undefined,
      family: flag.family,
      flagKey: flag.key,
      registryKeys: RUNTIME_FLAG_KEYS,
      storageReady: false,
      stored: null,
    }).readOnly;
    const row: FeatureFlagRow = {
      apps: flag.apps,
      appsComplete: flag.appsComplete,
      createdAt: flag.createdAt,
      description: flag.description,
      environments,
      key: flag.key,
      kind: flag.kind,
      legacy: flag.legacy,
      lifecycle: getFlagLifecycle(flag, now),
      mutable: environments.some((state) => state.effective !== 'unknown'),
      owner: flag.owner,
      readOnly,
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
