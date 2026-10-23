import type { AccountUsage, ActiveAssignment } from '../types';
import { DEFAULT_INSTANCE_LABELS } from '../types';
import { collectClaude } from './claude';
import { collectCodex } from './codex';
import { collectT3State, type T3SourceStatus } from './t3';

export interface Collectors {
  collectT3State: () => T3SourceStatus | Promise<T3SourceStatus>;
  collectClaude: (instanceId: string, label: string) => Promise<AccountUsage>;
  collectCodex: (instanceId: string, label: string) => Promise<AccountUsage>;
}

const DEFAULT_COLLECTORS: Collectors = {
  collectT3State,
  collectClaude,
  collectCodex,
};

export async function collectAll(): Promise<{
  accounts: AccountUsage[];
  active?: ActiveAssignment[];
  t3ObservedAt?: string;
  t3Error?: string;
}> {
  return collectAllWith(DEFAULT_COLLECTORS);
}

export async function collectAllWith(collectors: Collectors): Promise<{
  accounts: AccountUsage[];
  active?: ActiveAssignment[];
  t3ObservedAt?: string;
  t3Error?: string;
}> {
  const t3Result: Promise<{
    t3?: T3SourceStatus;
    t3Error?: string;
  }> = Promise.resolve()
    .then(() => collectors.collectT3State())
    .then((t3) => ({ t3 }))
    .catch(() => ({ t3Error: 'T3 activity state is unavailable.' }));
  const accounts = await Promise.all(
    Object.entries(DEFAULT_INSTANCE_LABELS).map(([instanceId, label]) =>
      instanceId.startsWith('claude')
        ? collectors.collectClaude(instanceId, label)
        : collectors.collectCodex(instanceId, label)
    )
  );
  const t3 = await t3Result;
  return {
    accounts,
    active: t3.t3?.activeAssignments,
    t3ObservedAt: t3.t3?.observedAt,
    t3Error: t3.t3Error,
  };
}
