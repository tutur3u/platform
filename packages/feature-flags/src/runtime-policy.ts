import { featureFlagCatalog } from './catalog';
import { registry } from './registry.generated';

export const RUNTIME_FLAG_KEYS = registry.map((flag) => flag.key);

const FAMILIES = [
  'mobile-runtime',
  'workspace-secret',
  'mobile-build',
] as const;

export type PlatformFlagFamily = (typeof FAMILIES)[number];

export type FlagKeyClassification =
  | { family: 'mobile-runtime'; mutable: true }
  | { family: 'workspace-secret'; mutable: false }
  | { family: 'mobile-build'; mutable: false }
  | { family: null; mutable: false };

const byKey = new Map(
  featureFlagCatalog.flags.map((flag) => [flag.key, flag.family] as const)
);

export function classifyFlagKey(key: string): FlagKeyClassification {
  const family = byKey.get(key);
  if (
    family === 'mobile-runtime' &&
    RUNTIME_FLAG_KEYS.some((runtimeKey) => runtimeKey === key)
  ) {
    return { family, mutable: true };
  }
  if (family === 'workspace-secret') return { family, mutable: false };
  if (family === 'mobile-build') return { family, mutable: false };
  return { family: null, mutable: false };
}

export function catalogFamilyCounts(): Record<
  PlatformFlagFamily | 'total',
  number
> {
  const counts = {
    'mobile-build': 0,
    'mobile-runtime': 0,
    'workspace-secret': 0,
    total: featureFlagCatalog.flags.length,
  };
  for (const flag of featureFlagCatalog.flags) {
    counts[flag.family] += 1;
  }
  return counts;
}
