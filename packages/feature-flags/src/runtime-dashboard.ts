export interface DashboardFlagProjection {
  effective: 'off' | 'on' | 'unknown';
  mutable: boolean;
  overrideEnabled: boolean | null;
  readOnly: 'mobile-build' | 'workspace-secret' | null;
  revision: number;
}

export function projectDashboardFlag(input: {
  evaluated: boolean | undefined;
  family: string;
  flagKey: string;
  registryKeys: readonly string[];
  storageReady: boolean;
  stored: { overrideEnabled: boolean | null; revision: number } | null;
}): DashboardFlagProjection {
  const readOnly =
    input.family === 'workspace-secret' || input.family === 'mobile-build'
      ? input.family
      : null;
  const mutable =
    input.storageReady &&
    readOnly === null &&
    input.family === 'mobile-runtime' &&
    input.registryKeys.includes(input.flagKey) &&
    typeof input.evaluated === 'boolean';
  if (!mutable) {
    return {
      effective: 'unknown',
      mutable: false,
      overrideEnabled: null,
      readOnly,
      revision: 0,
    };
  }
  return {
    effective: input.evaluated ? 'on' : 'off',
    mutable: true,
    overrideEnabled: input.stored?.overrideEnabled ?? null,
    readOnly: null,
    revision: input.stored?.revision ?? 0,
  };
}
