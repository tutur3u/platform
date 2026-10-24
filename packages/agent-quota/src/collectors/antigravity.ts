import type { AccountUsage } from '../types';

export function collectAntigravity(
  instanceId = 'antigravity',
  label = 'Antigravity',
  models: string[] = []
): AccountUsage {
  return {
    instanceId,
    provider: 'antigravity',
    label,
    models,
    windows: [],
    lastError: 'no-usage-signal',
  };
}
