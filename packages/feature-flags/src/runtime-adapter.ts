import {
  isRuntimeEnvironment,
  type RuntimeEnvironment,
} from './runtime-environment';

export interface RuntimeOverrideRecord {
  environment?: string;
  flagKey: string;
  overrideEnabled: boolean | null;
  revision: number;
  updatedAt?: string;
}

export type RuntimeStoreRead =
  | { status: 'ready'; overrides: readonly RuntimeOverrideRecord[] }
  | { status: 'unreachable' }
  | { status: 'denied' }
  | { status: 'invalid' };

export type RuntimeOverrideSelection =
  | { kind: 'denied' }
  | { kind: 'invalid' }
  | { kind: 'defaults' }
  | { kind: 'overrides'; overrides: Record<string, boolean> };

const UNREACHABLE_CODES = new Set([
  '08000',
  '08003',
  '08006',
  '57P01',
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST202',
]);

export function classifyStoreFailure(error: {
  code?: string;
  message?: string;
}): 'denied' | 'unreachable' {
  const message = error.message ?? '';
  if (
    error.code === '42501' ||
    message.includes('platform_feature_flag_denied')
  ) {
    return 'denied';
  }
  if (error.code && UNREACHABLE_CODES.has(error.code)) return 'unreachable';
  if (
    /fetch failed|network|ECONNREFUSED|ENOTFOUND|timeout|schema cache/i.test(
      message
    )
  ) {
    return 'unreachable';
  }
  return 'unreachable';
}

export function selectRuntimeOverrides(input: {
  keys: readonly string[];
  store: RuntimeStoreRead;
}): RuntimeOverrideSelection {
  if (input.store.status === 'denied') return { kind: 'denied' };
  if (input.store.status === 'invalid') return { kind: 'invalid' };
  if (input.store.status === 'unreachable') return { kind: 'defaults' };
  const allowed = new Set(input.keys);
  const overrides: Record<string, boolean> = {};
  for (const row of input.store.overrides) {
    if (!allowed.has(row.flagKey)) continue;
    if (typeof row.overrideEnabled !== 'boolean') continue;
    overrides[row.flagKey] = row.overrideEnabled;
  }
  return { kind: 'overrides', overrides };
}

export function assertRuntimeEnvironment(
  value: string
): RuntimeEnvironment | null {
  return isRuntimeEnvironment(value) ? value : null;
}

export type MobileFlagPlan =
  | { readStore: false; outcome: 'unauthorized' }
  | { readStore: true; outcome: 'denied' | 'invalid' | 'defaults' }
  | {
      readStore: true;
      outcome: 'overrides';
      overrides: Record<string, boolean>;
    };

export async function planMobileFeatureFlags(input: {
  authOk: boolean;
  keys: readonly string[];
  load: () => Promise<RuntimeStoreRead>;
}): Promise<MobileFlagPlan> {
  if (!input.authOk) return { readStore: false, outcome: 'unauthorized' };
  const store = await input.load();
  const selected = selectRuntimeOverrides({ keys: input.keys, store });
  if (selected.kind === 'overrides') {
    return {
      readStore: true,
      outcome: 'overrides',
      overrides: selected.overrides,
    };
  }
  return { readStore: true, outcome: selected.kind };
}
