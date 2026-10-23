import { accountKey } from './accounts';
import { HookError } from './hook-ledger';
import type { AdmissionContext } from './hooks-types';
import { SIGNAL_TTL_MS } from './policy';
import type { AccountUsage } from './types';
import { coversModel } from './window-scope';
export interface PoolSettings {
  reservePercent: number;
  nearUsedPercent: number;
  hysteresisPercent: number;
  pacingMs: number;
  maxConcurrent: number;
  preference: number;
}
export function validatePoolSettings(value: unknown): PoolSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HookError('pool-settings-invalid');
  const p = value as PoolSettings;
  const limits: Record<keyof PoolSettings, [number, number]> = {
    reservePercent: [0, 100],
    nearUsedPercent: [1, 100],
    hysteresisPercent: [0, 50],
    pacingMs: [0, 86400_000],
    maxConcurrent: [1, 100],
    preference: [0, 100],
  };
  if (
    Object.keys(p).some((key) => !(key in limits)) ||
    Object.entries(limits).some(([key, [min, max]]) => {
      const v = p[key as keyof PoolSettings];
      return typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max;
    }) ||
    !Number.isInteger(p.maxConcurrent) ||
    p.hysteresisPercent >= p.nearUsedPercent
  )
    throw new HookError('pool-settings-invalid');
  return p;
}
export function parsePoolSettings(
  value: unknown
): Record<string, PoolSettings> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HookError('pool-settings-invalid');
  return Object.fromEntries(
    Object.entries(value).map(([id, policy]) => [
      id,
      validatePoolSettings(policy),
    ])
  );
}
export function settingsFor(
  account: AccountUsage,
  context: AdmissionContext
): PoolSettings | undefined {
  const policies = (account.instanceIds ?? [account.instanceId]).flatMap(
    (id) => (context.poolSettings?.[id] ? [context.poolSettings[id]!] : [])
  );
  if (!policies.length) return;
  return {
    reservePercent: Math.max(...policies.map((p) => p.reservePercent)),
    nearUsedPercent: Math.min(...policies.map((p) => p.nearUsedPercent)),
    hysteresisPercent: Math.max(...policies.map((p) => p.hysteresisPercent)),
    pacingMs: Math.max(...policies.map((p) => p.pacingMs)),
    maxConcurrent: Math.min(...policies.map((p) => p.maxConcurrent)),
    preference: Math.max(...policies.map((p) => p.preference)),
  };
}
export function poolPolicyReasons(
  account: AccountUsage,
  model: string | undefined,
  count: number,
  context: AdmissionContext
): string[] {
  const policy = settingsFor(account, context);
  if (!policy) return [];
  const key = accountKey(account);
  const ids = account.instanceIds ?? [account.instanceId];
  const reasons: string[] = [];
  const windows = account.windows.filter((window) =>
    coversModel(window, model)
  );
  const fresh =
    windows.length &&
    windows.every(
      (w) =>
        w.authoritative &&
        typeof w.usedPercent === 'number' &&
        Date.parse(w.observedAt) <= context.now.getTime() &&
        context.now.getTime() - Date.parse(w.observedAt) <=
          SIGNAL_TTL_MS[account.provider] &&
        !!w.resetsAt &&
        Date.parse(w.resetsAt) > context.now.getTime()
    );
  if (fresh) {
    const used = Math.max(...windows.map((w) => w.usedPercent!));
    const holdKey = `${key}:${model ?? '*'}`;
    context.ledger.poolHolds ??= {};
    const held = context.ledger.poolHolds[holdKey] === true;
    const near =
      used >= policy.nearUsedPercent ||
      (held && used > policy.nearUsedPercent - policy.hysteresisPercent);
    context.ledger.poolHolds[holdKey] = near;
    if (near) reasons.push('pool-near-hysteresis');
    if (100 - used <= policy.reservePercent) reasons.push('pool-reserve');
  } else {
    if (context.ledger.poolHolds?.[`${key}:${model ?? '*'}`])
      reasons.push('pool-near-hysteresis');
    if (policy.reservePercent > 0) reasons.push('pool-reserve-unknown');
  }
  if (count >= policy.maxConcurrent) reasons.push('pool-concurrency');
  const latest = Math.max(
    0,
    ...context.ledger.reservations
      .filter((r) => ids.includes(r.instanceId))
      .map((r) => Date.parse(r.createdAt)),
    ...ids.map((id) => context.ledger.lastAdmissions?.[id] ?? 0)
  );
  const elapsedSinceAdmission = context.now.getTime() - latest;
  if (
    policy.pacingMs > 0 &&
    elapsedSinceAdmission >= 0 &&
    elapsedSinceAdmission < policy.pacingMs
  )
    reasons.push('pool-pacing');
  return reasons;
}
