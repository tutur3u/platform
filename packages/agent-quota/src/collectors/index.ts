import {
  antigravityProfile,
  oldAntigravityProfile,
} from './antigravity-profile';
import { stateRoot } from '../state-root';
import {
  collectAntigravityAccountMatches,
  readAntigravityRenameMap,
} from './antigravity-account';
import {
  matchingBlocks,
  type QuotaBlock,
  readBlockLedger,
} from '../block-ledger';
import { type PoolSettings, parsePoolSettings } from '../pool-settings';
import type { AccountUsage, ActiveAssignment, Provider } from '../types';
import { DEFAULT_INSTANCE_LABELS } from '../types';
import {
  applyImportedUsage,
  applyManualUsage,
  type ManualUsage,
  parseManualUsage,
} from '../usage-import';
import { collectAntigravityBlocks } from './antigravity-blocks';
import { collectCatalog, parseCatalog } from './catalog';
import { collectClaude } from './claude';
import { collectCodex } from './codex';
import { discoverSnapshotInstances } from './discover';
import { collectSnapshot } from './snapshot';
import { collectT3State, type T3SourceStatus } from './t3';

export interface Collectors {
  collectT3State: () => T3SourceStatus | Promise<T3SourceStatus>;
  collectCatalog: typeof collectCatalog;
  collectClaude: typeof collectClaude;
  collectCodex: typeof collectCodex;
  collectSnapshot: typeof collectSnapshot;
  readBlockLedger: typeof readBlockLedger;
}

const DEFAULT_COLLECTORS: Collectors = {
  collectT3State,
  collectCatalog,
  collectClaude,
  collectCodex,
  collectSnapshot,
  readBlockLedger,
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
  blocks: QuotaBlock[];
  poolSettings: Record<string, PoolSettings>;
  invalidObservations: string[];
  alerts: string[];
  manualObservations?: ManualUsage[];
}

type ExtendedLedger = Awaited<ReturnType<typeof readBlockLedger>> & {
  usageImport?: unknown;
  observations?: unknown;
  poolSettings?: unknown;
};

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
  const [{ blocks, usageImport, observations, poolSettings }, catalog] =
    await Promise.all([
      collectors.readBlockLedger().then((ledger) => ledger as ExtendedLedger),
      options.catalog === undefined
        ? collectors.collectCatalog()
        : Promise.resolve(parseCatalog(options.catalog)),
    ]);
  const discovered = catalog.length ? [] : await discoverSnapshotInstances();
  const instances = catalog.length
    ? catalog
    : discovered.length
      ? discovered
      : Object.entries(DEFAULT_INSTANCE_LABELS).map(([instanceId, label]) => ({
          instanceId,
          label,
          provider: providerForInstance(instanceId),
          models: [],
          modelOptions: {},
          available: false,
        }));
  const snapshots = await Promise.all(
    instances.map((instance) =>
      collectors.collectSnapshot({
        instanceId: instance.instanceId,
        label: instance.label,
        provider: instance.provider,
        windows: [],
        lastError: 'no-usage-signal',
      })
    )
  );
  const cached = applyImportedUsage(snapshots, usageImport);
  const now = new Date();
  const accounts = await Promise.all(
    instances.map(async (instance, index) => {
      const { instanceId, label, provider } = instance;
      const cache = cached[index]!;
      const aliases = cached
        .filter(
          (item) =>
            item.instanceId === instanceId ||
            Boolean(
              cache.accountIdentityHash &&
              item.provider === provider &&
              item.accountIdentityHash === cache.accountIdentityHash
            )
        )
        .map((item) => item.instanceId);
      const blocked =
        matchingBlocks(blocks, aliases, undefined, now).length > 0;
      const account =
        blocked ||
        options.snapshotsOnly !== false ||
        (provider !== 'claude' && provider !== 'codex')
          ? cache
          : provider === 'claude'
            ? await collectors.collectClaude(instanceId, label)
            : await collectors.collectCodex(instanceId, label);
      const snapshot =
        account === cache ? cache : await collectors.collectSnapshot(account);
      const models = instance.models.length
        ? instance.models
        : (snapshot.models ?? []);
      const modelOptions = Object.keys(instance.modelOptions).length
        ? instance.modelOptions
        : (snapshot.modelOptions ?? {});
      return {
        ...snapshot,
        models,
        modelOptions,
        available: instance.available,
      };
    })
  );
  const invalidObservations: string[] = [];
  const rawObs = Array.isArray(observations) ? observations : [];
  const parsedManual = parseManualUsage(rawObs, now).observations;
  const withManual = applyManualUsage(
    await collectAntigravityAccountMatches(
      applyImportedUsage(accounts, usageImport),
      now
    ),
    rawObs,
    invalidObservations,
    now,
    blocks
  );
  const t3 = await t3Result;
  const antigravityIds = withManual
    .filter((account) => account.provider === 'antigravity')
    .map((account) => account.instanceId);
  let runBlocks: QuotaBlock[] = [];
  let receiptAlert: string[] = [];
  if (t3.t3) {
    try {
      runBlocks = collectAntigravityBlocks(antigravityIds, now);
    } catch {
      receiptAlert = ['ANTIGRAVITY_RUN_RECEIPTS_UNAVAILABLE'];
    }
  }
  const gone = catalog.length
    ? (t3.t3?.referencedInstances ?? []).filter(
        (id) => !catalog.some((entry) => entry.instanceId === id)
      )
    : [];
  const renameMap = gone.length ? await readAntigravityRenameMap() : undefined;
  const renames = catalog.flatMap(({ instanceId, provider }) => {
    if (provider !== 'antigravity' || !renameMap) return [];
    const root = stateRoot('');
    const oldPath = oldAntigravityProfile(root, instanceId, renameMap);
    if (!oldPath) return [];
    const oldId = gone.find((id) => oldPath === antigravityProfile(root, id));
    return oldId ? [`INSTANCE_RENAME_CANDIDATE ${oldId} -> ${instanceId}`] : [];
  });
  return {
    accounts: withManual,
    alerts: [
      ...receiptAlert,
      ...withManual.flatMap((account) =>
        accountHealth(account).lastErrorClass === 'auth'
          ? [`AUTH_REQUIRED ${account.instanceId}`]
          : []
      ),
      ...gone.map((id) => `INSTANCE_GONE ${id}`),
      ...renames,
    ],
    active: t3.t3?.activeAssignments,
    t3ObservedAt: t3.t3?.observedAt,
    t3Error: t3.t3Error,
    blocks: [...blocks, ...runBlocks],
    poolSettings: parsePoolSettings(poolSettings),
    invalidObservations,
    manualObservations: parsedManual,
  };
}

function providerForInstance(instanceId: string): Provider {
  if (instanceId === 'antigravity') return 'antigravity';
  if (instanceId === 'grok') return 'grok';
  if (instanceId === 'cursor') return 'cursor';
  if (instanceId === 'opencode') return 'opencode';
  return instanceId.startsWith('claude') ? 'claude' : 'codex';
}

export function accountHealth(account: AccountUsage) {
  const signal = [
    account.lastError,
    account.providerStatus,
    account.statusMessage,
  ].join(' ');
  const lastErrorClass =
    /unauthenticated|authentication (?:required|failure|failed)|unauthori[sz]ed|login required/i.test(
      signal
    )
      ? 'auth'
      : account.providerStatus === 'disabled'
        ? 'disabled'
        : /model (?:not on|unavailable on|not included in) (?:your |the )?plan/i.test(
              signal
            )
          ? 'model-not-on-plan'
          : /quota (?:reached|exceeded)|usage limit|rate limit/i.test(signal)
            ? 'usage-limit'
            : account.lastError
              ? 'unknown'
              : null;
  return {
    authenticated:
      lastErrorClass === 'auth'
        ? false
        : account.providerStatus === 'ready'
          ? true
          : null,
    lastErrorClass,
  };
}
