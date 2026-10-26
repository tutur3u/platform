import { createHash } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';
import { blockUntil, matchesScope, type QuotaBlock } from './block-ledger';
import {
  failureClass,
  MAX_FUTURE_OBSERVATION_SKEW_MS,
  safeReceipt,
} from './failure-receipt';
import { HookError } from './hook-ledger';
import type { AccountUsage, UsageWindow } from './types';
import { PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS } from './window-freshness';
import {
  coversModel,
  noResetWindowMaxAgeMs,
  providerWindowScope,
  windowScope,
} from './window-scope';

export interface ManualUsage {
  pool: string;
  measure: 'remaining' | 'used';
  units: 'percent';
  value: number;
  observedAt: string;
  resetAt?: string;
  windowId: string;
  windowLabel: string;
  provenance: string;
  confidence: 'manual';
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function manualUsage(value: unknown, now = new Date()): ManualUsage {
  const input = record(value);
  const legacy =
    input.kind === 'manual-screenshot' &&
    typeof input.sessionRemainingPercent === 'number';
  const metric = typeof input.metric === 'string' ? input.metric.trim() : '';
  const metricId = metric
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const output = {
    pool: input.pool,
    measure: legacy ? 'remaining' : input.measure,
    units: legacy ? 'percent' : input.units,
    value: legacy ? input.sessionRemainingPercent : input.value,
    observedAt: input.observedAt,
    resetAt: input.resetAt ?? input.resetsAt,
    windowId: legacy
      ? /week|seven.?day/.test(metricId)
        ? `seven_day_${metricId.replace(/^(?:weekly|seven_day)_?/, '') || 'default'}`
        : 'five_hour'
      : input.windowId,
    windowLabel: legacy ? metric || 'Session' : input.windowLabel,
    provenance: legacy
      ? `manual-screenshot; ${typeof input.capturedLocal === 'string' ? input.capturedLocal : 'time not supplied'}; user-relayed`
      : input.provenance,
    confidence: 'manual',
  };
  if (
    typeof output.observedAt === 'string' &&
    Number.isFinite(Date.parse(output.observedAt)) &&
    Date.parse(output.observedAt) >
      now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS
  )
    throw new HookError('manual-usage-future-observed-at');
  if (
    typeof output.pool !== 'string' ||
    !/^[\w-]+$/.test(output.pool) ||
    !['remaining', 'used'].includes(String(output.measure)) ||
    output.units !== 'percent' ||
    typeof output.value !== 'number' ||
    !Number.isFinite(output.value) ||
    output.value < 0 ||
    output.value > 100 ||
    typeof output.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(output.observedAt)) ||
    (output.resetAt !== undefined &&
      (typeof output.resetAt !== 'string' ||
        !Number.isFinite(Date.parse(output.resetAt)))) ||
    typeof output.windowId !== 'string' ||
    typeof output.windowLabel !== 'string' ||
    typeof output.provenance !== 'string' ||
    !output.provenance.trim()
  )
    throw new HookError('manual-usage-invalid');
  return {
    ...output,
    provenance: safeReceipt(output.provenance, failureClass(output.provenance))
      .text,
  } as ManualUsage;
}
export function parseManualUsage(
  values: unknown[],
  now = new Date()
): {
  observations: ManualUsage[];
  invalid: string[];
} {
  const observations: ManualUsage[] = [];
  const invalid: string[] = [];
  values.forEach((value, index) => {
    try {
      observations.push(manualUsage(value, now));
    } catch (error) {
      invalid.push(
        `observations[${index}]: ${error instanceof HookError ? error.message : 'manual-usage-invalid'}`
      );
    }
  });
  return { observations, invalid };
}
export function homeIdentity(
  settings: unknown,
  instanceId: string,
  provider: AccountUsage['provider']
): string | undefined {
  const instance = record(
    record(record(settings).providerInstances)[instanceId]
  );
  if (instance.driver !== (provider === 'claude' ? 'claudeAgent' : provider))
    return;
  const config = record(instance.config);
  const home =
    provider === 'codex' && config.shadowHomePath !== undefined
      ? config.shadowHomePath
      : config.homePath;
  if (typeof home !== 'string' || !isAbsolute(home)) return;
  return createHash('sha256')
    .update(`${provider}-home:${normalize(home)}`)
    .digest('hex');
}
export function applyManualUsage(
  accounts: AccountUsage[],
  values: unknown[],
  invalidObservations: string[] = [],
  now = new Date(),
  blocks: QuotaBlock[] = []
): AccountUsage[] {
  const parsed = parseManualUsage(values, now);
  invalidObservations.push(...parsed.invalid);
  const observations = parsed.observations;
  return accounts.map((account) => {
    const aliases = accounts
      .filter(
        (candidate) =>
          candidate.instanceId === account.instanceId ||
          (account.accountIdentityHash &&
            candidate.provider === account.provider &&
            candidate.accountIdentityHash === account.accountIdentityHash)
      )
      .map((candidate) => candidate.instanceId);
    const latest = new Map<string, ManualUsage>();
    for (const observation of observations.filter(
      (item) => item.pool === account.instanceId
    )) {
      const previous = latest.get(observation.windowId);
      if (
        !previous ||
        Date.parse(previous.observedAt) < Date.parse(observation.observedAt)
      )
        latest.set(observation.windowId, observation);
    }
    const windows = [...account.windows];
    for (const observation of latest.values()) {
      const previous = windows.filter(
        (window) => window.id === observation.windowId
      );
      // A newer provider snapshot supersedes the manual reading, never its receipt time.
      if (
        previous.some(
          (window) =>
            Date.parse(window.observedAt) >= Date.parse(observation.observedAt)
        )
      )
        continue;
      for (let i = windows.length - 1; i >= 0; i--)
        if (windows[i]?.id === observation.windowId) windows.splice(i, 1);
      const scope = windowScope(
        account.provider,
        observation.windowId,
        observation.windowLabel
      );
      const kind = observation.windowId === 'five_hour' ? 'short' : 'long';
      const maxWindowAge = noResetWindowMaxAgeMs({
        id: observation.windowId,
        kind,
      });
      const scopedModels =
        scope.kind === 'account'
          ? (account.models ?? [])
          : scope.kind === 'models'
            ? (account.models ?? []).filter((model) =>
                coversModel({ scope } as UsageWindow, model)
              )
            : [];
      const wholeWindowScopeCovered = (modelScope: string) =>
        modelScope === '*' ||
        (scopedModels.length > 0 &&
          scopedModels.every((model) => matchesScope(modelScope, model)));
      const inheritedReset = blocks
        .filter(
          (block) =>
            aliases.includes(block.pool) &&
            block.kind !== 'capacity' &&
            blockUntil(block) > now.getTime() &&
            Number.isFinite(Date.parse(block.observedAt)) &&
            Date.parse(block.observedAt) <=
              now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS &&
            now.getTime() - Date.parse(block.observedAt) <= maxWindowAge &&
            wholeWindowScopeCovered(block.modelScope)
        )
        .map((block) => block.resetAt)
        .filter(
          (reset): reset is string =>
            typeof reset === 'string' &&
            Number.isFinite(Date.parse(reset)) &&
            Date.parse(reset) > now.getTime() &&
            Date.parse(reset) <=
              Date.parse(observation.observedAt) + maxWindowAge
        )
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      windows.push({
        id: observation.windowId,
        label: observation.windowLabel,
        kind,
        scope,
        usedPercent:
          observation.measure === 'remaining'
            ? 100 - observation.value
            : observation.value,
        resetsAt: observation.resetAt ?? inheritedReset,
        observedAt: observation.observedAt,
        source: observation.provenance,
        confidence: 'manual',
        authoritative: true,
      });
    }
    return { ...account, windows };
  });
}
export function snapshotWindows(
  account: AccountUsage,
  limits: unknown
): UsageWindow[] {
  const data = record(limits);
  if (
    data.unavailable ||
    typeof data.checkedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.checkedAt)) ||
    !Array.isArray(data.windows)
  )
    return [];
  return data.windows.map((value) => {
    const window = record(value);
    if (
      typeof window.usedPercent !== 'number' ||
      !Number.isFinite(window.usedPercent) ||
      window.usedPercent < 0 ||
      window.usedPercent > 100 ||
      typeof window.id !== 'string'
    )
      throw new HookError('usage-window-invalid');
    const providerWindowKind =
      window.kind === 'session' ||
      window.kind === 'weekly' ||
      window.kind === 'monthly' ||
      window.kind === 'other'
        ? window.kind
        : undefined;
    const kindKnown = providerWindowKind !== undefined;
    return {
      id: window.id,
      label: typeof window.label === 'string' ? window.label : '',
      scope: providerWindowScope(
        account.provider,
        window.id,
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
      usedPercent: window.usedPercent,
      resetsAt:
        typeof window.resetsAt === 'string' ? window.resetsAt : undefined,
      observedAt: data.checkedAt as string,
      source: 'T3 server.getConfig usageLimits import',
      confidence: 'provider',
      authoritative: kindKnown,
    } satisfies UsageWindow;
  });
}
export function applyImportedUsage(
  accounts: AccountUsage[],
  value: unknown
): AccountUsage[] {
  const data = record(value);
  const providers = Array.isArray(data.providers)
    ? data.providers.map(record)
    : [];
  return accounts.map((account) => {
    const provider = providers.find(
      (item) =>
        item.instanceId === account.instanceId &&
        item.driver ===
          (account.provider === 'claude' ? 'claudeAgent' : account.provider)
    );
    const windows = provider
      ? snapshotWindows(account, provider.usageLimits)
      : [];
    if (provider && windows.length === 0)
      return {
        ...account,
        windows: account.windows.map((window) => ({
          ...window,
          freshnessTtlMs: 0,
        })),
      };
    const newer =
      windows.length &&
      (!account.windows.length ||
        Date.parse(windows[0]!.observedAt) >
          Math.max(
            ...account.windows.map((window) => Date.parse(window.observedAt))
          ));
    return {
      ...account,
      accountIdentityHash:
        account.accountIdentityHash ??
        homeIdentity(data.settings, account.instanceId, account.provider),
      windows: newer ? windows : account.windows,
    };
  });
}

export function mergeUsageImport(
  previous: unknown,
  next: unknown,
  now = new Date()
) {
  const old = record(previous),
    update = record(next);
  const providers = new Map<string, Record<string, unknown>>();
  for (const item of [
    ...(Array.isArray(old.providers) ? old.providers : []),
    ...(Array.isArray(update.providers) ? update.providers : []),
  ]) {
    const provider = record(item);
    if (typeof provider.instanceId !== 'string') continue;
    const checkedAt = Date.parse(
      String(record(provider.usageLimits).checkedAt)
    );
    if (
      !Number.isFinite(checkedAt) ||
      checkedAt > now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS
    )
      continue;
    const existing = providers.get(provider.instanceId);
    if (
      !existing ||
      Date.parse(String(record(provider.usageLimits).checkedAt)) >=
        Date.parse(String(record(existing.usageLimits).checkedAt))
    )
      providers.set(provider.instanceId, provider);
  }
  const provenance = [update.provenance, old.provenance].find(
    (value): value is string => typeof value === 'string'
  );
  return {
    providers: [...providers.values()],
    settings: {
      providerInstances: {
        ...record(record(old.settings).providerInstances),
        ...record(record(update.settings).providerInstances),
      },
    },
    provenance: provenance
      ? safeReceipt(provenance, failureClass(provenance)).text
      : undefined,
  };
}
