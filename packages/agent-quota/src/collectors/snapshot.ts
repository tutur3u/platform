import { join } from 'node:path';
import { failureClass, safeReceipt } from '../failure-receipt';
import { opencodeModelTier } from '../routing-config';
import type { AccountUsage, BalanceTelemetry, UsageWindow } from '../types';
import { homeIdentity } from '../usage-import';
import { PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS } from '../window-freshness';
import { providerWindowScope } from '../window-scope';
import { extractModelsFromCache, readRegularJsonFile } from './discover';
import { defaultCollectorPaths } from './paths';
import { providerToDriver } from './provider';

function parseBalanceTelemetry(
  limits: Record<string, unknown>
): BalanceTelemetry | undefined {
  const candidates = [
    { key: 'balance', value: limits.balance },
    { key: 'credits', value: limits.credits },
    { key: 'usageBalance', value: limits.usageBalance },
    { key: 'billing', value: limits.billing },
  ];
  for (const candidate of candidates) {
    const raw = candidate.value;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return {
        remaining: raw,
        exhausted: raw <= 0,
        source: `usageLimits.${candidate.key}`,
      };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const remaining =
      typeof obj.remaining === 'number'
        ? obj.remaining
        : typeof obj.remainingUsd === 'number'
          ? obj.remainingUsd
          : typeof obj.available === 'number'
            ? obj.available
            : typeof obj.balance === 'number'
              ? obj.balance
              : undefined;
    const total =
      typeof obj.total === 'number'
        ? obj.total
        : typeof obj.limit === 'number'
          ? obj.limit
          : typeof obj.totalUsd === 'number'
            ? obj.totalUsd
            : undefined;
    const used =
      typeof obj.used === 'number'
        ? obj.used
        : typeof obj.usedUsd === 'number'
          ? obj.usedUsd
          : undefined;
    const exhausted =
      obj.exhausted === true ||
      (remaining !== undefined && remaining <= 0) ||
      (total !== undefined && used !== undefined && used >= total);
    return {
      ...(remaining !== undefined ? { remaining } : {}),
      ...(total !== undefined ? { total } : {}),
      ...(used !== undefined ? { used } : {}),
      ...(typeof obj.currency === 'string' ? { currency: obj.currency } : {}),
      ...(typeof obj.unit === 'string' ? { unit: obj.unit } : {}),
      ...(typeof obj.label === 'string' ? { label: obj.label } : {}),
      exhausted,
      source: `usageLimits.${candidate.key}`,
    };
  }
  if (
    typeof limits.remainingCredits === 'number' &&
    Number.isFinite(limits.remainingCredits)
  ) {
    return {
      remaining: limits.remainingCredits,
      exhausted: limits.remainingCredits <= 0,
      unit: 'credits',
      source: 'usageLimits.remainingCredits',
    };
  }
  if (
    limits.resetCredits &&
    typeof limits.resetCredits === 'object' &&
    typeof (limits.resetCredits as Record<string, unknown>).availableCount ===
      'number'
  ) {
    return {
      remaining: (limits.resetCredits as Record<string, unknown>)
        .availableCount as number,
      unit: 'resetCredits',
      source: 'usageLimits.resetCredits',
    };
  }
  return undefined;
}

function parseWindowUsedPercent(
  window: Record<string, unknown>
): number | null {
  if (
    typeof window.usedPercent === 'number' &&
    Number.isFinite(window.usedPercent) &&
    window.usedPercent >= 0 &&
    window.usedPercent <= 100
  )
    return window.usedPercent;
  if (
    typeof window.remaining === 'number' &&
    Number.isFinite(window.remaining) &&
    window.remaining >= 0 &&
    typeof window.total === 'number' &&
    Number.isFinite(window.total) &&
    window.total > 0
  )
    return Math.max(
      0,
      Math.min(100, (1 - window.remaining / window.total) * 100)
    );
  return null;
}

// Provider status caches are distinct from provider profiles and authentication files.
export async function collectSnapshot(
  account: AccountUsage,
  cacheDir = defaultCollectorPaths().snapshotCacheDir,
  settings?: unknown
): Promise<AccountUsage> {
  if (!/^[a-zA-Z0-9_-]+$/.test(account.instanceId)) return account;
  try {
    const value = (await readRegularJsonFile(
      join(cacheDir, `${account.instanceId}.json`)
    )) as Record<string, unknown>;
    const identityFromHome = homeIdentity(
      settings,
      account.instanceId,
      account.provider
    );
    const driver = providerToDriver(account.provider);
    if (value.instanceId !== account.instanceId || value.driver !== driver)
      return demoteSnapshot(account, 'snapshot-identity-mismatch');

    const extracted = extractModelsFromCache(value);
    const models = account.models?.length ? account.models : extracted.models;
    const modelOptions =
      account.modelOptions && Object.keys(account.modelOptions).length
        ? account.modelOptions
        : extracted.modelOptions;
    const providerStatus =
      typeof value.status === 'string' ? value.status : undefined;
    const statusMessage =
      typeof value.message === 'string' && value.message.trim()
        ? safeReceipt(value.message, failureClass(value.message)).text
        : undefined;
    const neverUseModels =
      account.provider === 'opencode'
        ? models.filter((m) => opencodeModelTier(m) === 'paid-zen')
        : undefined;

    const limits = value.usageLimits as Record<string, unknown> | undefined;
    const balance = limits ? parseBalanceTelemetry(limits) : undefined;
    account = {
      ...account,
      models,
      modelOptions,
      ...(providerStatus ? { providerStatus } : {}),
      ...(statusMessage ? { statusMessage } : {}),
      ...(balance ? { balance } : {}),
      ...(neverUseModels?.length ? { neverUseModels } : {}),
      accountIdentityHash:
        typeof limits?.credentialFingerprint === 'string' &&
        /^[a-f0-9]{64}$/i.test(limits.credentialFingerprint)
          ? limits.credentialFingerprint
          : identityFromHome,
    };
    if (
      !limits ||
      typeof limits.checkedAt !== 'string' ||
      !Array.isArray(limits.windows)
    )
      return demoteSnapshot(account, 'no-usage-signal');
    if (
      limits.unavailable ||
      limits.windows.some(
        (window: unknown) =>
          !window ||
          typeof window !== 'object' ||
          parseWindowUsedPercent(window as Record<string, unknown>) === null
      )
    )
      return demoteSnapshot(account, 'no-usage-signal');
    const windows: UsageWindow[] = limits.windows.flatMap(
      (rawWindow: unknown) => {
        if (!rawWindow || typeof rawWindow !== 'object') return [];
        const window = rawWindow as Record<string, unknown>;
        const usedPercent = parseWindowUsedPercent(window);
        if (usedPercent === null) return [];
        const providerWindowKind =
          window.kind === 'session' ||
          window.kind === 'weekly' ||
          window.kind === 'monthly' ||
          window.kind === 'other'
            ? window.kind
            : undefined;
        const kindKnown = providerWindowKind !== undefined;
        return [
          {
            id: typeof window.id === 'string' ? window.id : undefined,
            label: typeof window.label === 'string' ? window.label : undefined,
            scope: providerWindowScope(
              account.provider,
              typeof window.id === 'string' ? window.id : '',
              typeof window.label === 'string' ? window.label : '',
              providerWindowKind
            ),
            kind:
              providerWindowKind === 'weekly' ||
              providerWindowKind === 'monthly' ||
              (typeof window.windowDurationMins === 'number' &&
                window.windowDurationMins > 1440)
                ? 'long'
                : 'short',
            providerWindowKind,
            freshnessTtlMs: PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS,
            windowDurationMins:
              typeof window.windowDurationMins === 'number' &&
              Number.isFinite(window.windowDurationMins) &&
              window.windowDurationMins > 0
                ? window.windowDurationMins
                : undefined,
            usedPercent,
            resetsAt:
              typeof window.resetsAt === 'string' ? window.resetsAt : undefined,
            source: 'T3 provider status cache usageLimits',
            confidence: 'provider',
            observedAt: limits.checkedAt as string,
            authoritative: kindKnown,
          },
        ];
      }
    );
    if (windows.length === 0) return demoteSnapshot(account, 'no-usage-signal');
    return {
      ...account,
      windows,
      accountIdentityHash:
        typeof limits.credentialFingerprint === 'string' &&
        /^[a-f0-9]{64}$/i.test(limits.credentialFingerprint)
          ? limits.credentialFingerprint
          : identityFromHome,
      lastError: windows.length ? undefined : 'no-usage-signal',
    };
  } catch {
    return demoteSnapshot(account, 'snapshot-unreadable');
  }
}

function demoteSnapshot(account: AccountUsage, reason: string): AccountUsage {
  return {
    ...account,
    windows: account.windows.map((window) => ({
      ...window,
      freshnessTtlMs: 0,
    })),
    lastError: reason,
  };
}
