import type { AccountUsage, ActiveAssignment, Provider } from '../types';
import { DEFAULT_INSTANCE_LABELS } from '../types';
import { collectAntigravity } from './antigravity';
import { collectCatalog, parseCatalog } from './catalog';
import { collectClaude } from './claude';
import { collectCodex } from './codex';
import { collectSnapshot } from './snapshot';
import { collectT3State, type T3SourceStatus } from './t3';

export interface Collectors {
  collectT3State: () => T3SourceStatus | Promise<T3SourceStatus>;
  collectCatalog: typeof collectCatalog;
  collectClaude: typeof collectClaude;
  collectCodex: typeof collectCodex;
  collectAntigravity: typeof collectAntigravity;
  collectSnapshot: typeof collectSnapshot;
}

const DEFAULT_COLLECTORS: Collectors = {
  collectT3State,
  collectCatalog,
  collectClaude,
  collectCodex,
  collectAntigravity,
  collectSnapshot,
};

export interface CollectOptions {
  snapshotsOnly?: boolean;
  catalog?: unknown;
}

export interface CollectionResult {
  accounts: AccountUsage[];
  active?: ActiveAssignment[];
  t3ObservedAt?: string;
  t3Error?: string;
}

export async function collectAll(
  options: CollectOptions = {}
): Promise<CollectionResult> {
  return collectAllWith(DEFAULT_COLLECTORS, options);
}

export async function collectAllWith(
  overrides: Partial<Collectors>,
  options: CollectOptions = {}
): Promise<CollectionResult> {
  const collectors = { ...DEFAULT_COLLECTORS, ...overrides };
  const t3Result: Promise<{ t3?: T3SourceStatus; t3Error?: string }> =
    Promise.resolve()
      .then(() => collectors.collectT3State())
      .then((t3) => ({ t3 }))
      .catch(() => ({ t3Error: 'T3 activity state is unavailable.' }));
  const catalog =
    options.catalog === undefined
      ? await collectors.collectCatalog()
      : parseCatalog(options.catalog);
  const instances = catalog.length
    ? catalog
    : Object.entries(DEFAULT_INSTANCE_LABELS).map(([instanceId, label]) => ({
        instanceId,
        label,
        provider: providerForInstance(instanceId),
        models: [],
        modelOptions: {},
        available: false,
      }));
  const accounts = await Promise.all(
    instances.map(async (instance) => {
      const { instanceId, label, provider } = instance;
      const empty: AccountUsage = {
        instanceId,
        label,
        provider,
        windows: [],
        lastError: 'no-usage-signal',
      };
      const account =
        provider === 'antigravity'
          ? collectors.collectAntigravity(instanceId, label, instance.models)
          : options.snapshotsOnly
            ? empty
            : provider === 'claude'
              ? await collectors.collectClaude(instanceId, label)
              : await collectors.collectCodex(instanceId, label);
      const snapshot = await collectors.collectSnapshot(account);
      return {
        ...snapshot,
        models: instance.models,
        modelOptions: instance.modelOptions,
        available: instance.available,
      };
    })
  );
  const t3 = await t3Result;
  return {
    accounts,
    active: t3.t3?.activeAssignments,
    t3ObservedAt: t3.t3?.observedAt,
    t3Error: t3.t3Error,
  };
}

function providerForInstance(instanceId: string): Provider {
  if (instanceId === 'antigravity') return 'antigravity';
  return instanceId.startsWith('claude') ? 'claude' : 'codex';
}
