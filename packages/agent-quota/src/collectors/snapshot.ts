import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AccountUsage, UsageWindow } from '../types';

// Provider status caches are distinct from provider profiles and authentication files.
export async function collectSnapshot(
  account: AccountUsage,
  cacheDir = join(homedir(), '.t3', 'caches')
): Promise<AccountUsage> {
  if (!/^[a-zA-Z0-9_-]+$/.test(account.instanceId)) return account;
  try {
    const value = JSON.parse(
      await readFile(join(cacheDir, `${account.instanceId}.json`), 'utf8')
    );
    const driver =
      account.provider === 'claude' ? 'claudeAgent' : account.provider;
    if (value.instanceId !== account.instanceId || value.driver !== driver)
      return account;
    const limits = value.usageLimits;
    if (
      !limits ||
      typeof limits.checkedAt !== 'string' ||
      !Array.isArray(limits.windows)
    )
      return account;
    if (
      limits.unavailable ||
      limits.windows.some(
        (window: Record<string, unknown> | null) =>
          !window ||
          typeof window.usedPercent !== 'number' ||
          !Number.isFinite(window.usedPercent) ||
          window.usedPercent < 0 ||
          window.usedPercent > 100
      )
    )
      return { ...account, windows: [], lastError: 'no-usage-signal' };
    const windows: UsageWindow[] = limits.windows.flatMap(
      (window: Record<string, unknown>) => {
        if (
          typeof window.usedPercent !== 'number' ||
          !Number.isFinite(window.usedPercent) ||
          window.usedPercent < 0 ||
          window.usedPercent > 100
        )
          return [];
        return [
          {
            kind:
              window.kind === 'weekly' ||
              (typeof window.windowDurationMins === 'number' &&
                window.windowDurationMins > 1440)
                ? 'long'
                : 'short',
            usedPercent: window.usedPercent,
            resetsAt:
              typeof window.resetsAt === 'string' ? window.resetsAt : undefined,
            source: 'T3 provider status cache usageLimits',
            observedAt: limits.checkedAt,
            authoritative: true,
          },
        ];
      }
    );
    return {
      ...account,
      windows,
      accountIdentityHash:
        typeof limits.credentialFingerprint === 'string' &&
        /^[a-f0-9]{64}$/i.test(limits.credentialFingerprint)
          ? limits.credentialFingerprint
          : undefined,
      lastError: windows.length ? undefined : 'no-usage-signal',
    };
  } catch {
    return account;
  }
}
