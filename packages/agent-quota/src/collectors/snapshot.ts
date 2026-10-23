import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AccountUsage, UsageWindow } from '../types';
import { homeIdentity } from '../usage-import';
import { windowScope } from '../window-scope';

// Provider status caches are distinct from provider profiles and authentication files.
export async function collectSnapshot(
  account: AccountUsage,
  cacheDir = join(homedir(), '.t3', 'caches'),
  settings?: unknown
): Promise<AccountUsage> {
  if (!/^[a-zA-Z0-9_-]+$/.test(account.instanceId)) return account;
  try {
    const file = await open(
      join(cacheDir, `${account.instanceId}.json`),
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const value = await (async () => {
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 2_000_000)
          throw new Error('snapshot-invalid-or-full');
        return JSON.parse(await file.readFile('utf8'));
      } finally {
        await file.close();
      }
    })();
    const identityFromHome = homeIdentity(
      settings,
      account.instanceId,
      account.provider
    );
    const driver =
      account.provider === 'claude' ? 'claudeAgent' : account.provider;
    if (value.instanceId !== account.instanceId || value.driver !== driver)
      return account;
    const limits = value.usageLimits;
    account = {
      ...account,
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
            id: typeof window.id === 'string' ? window.id : undefined,
            label: typeof window.label === 'string' ? window.label : undefined,
            scope: windowScope(
              account.provider,
              typeof window.id === 'string' ? window.id : '',
              typeof window.label === 'string' ? window.label : ''
            ),
            kind:
              window.kind === 'weekly' ||
              (typeof window.windowDurationMins === 'number' &&
                window.windowDurationMins > 1440)
                ? 'long'
                : 'short',
            windowDurationMins:
              typeof window.windowDurationMins === 'number' &&
              Number.isFinite(window.windowDurationMins) &&
              window.windowDurationMins > 0
                ? window.windowDurationMins
                : undefined,
            usedPercent: window.usedPercent,
            resetsAt:
              typeof window.resetsAt === 'string' ? window.resetsAt : undefined,
            source: 'T3 provider status cache usageLimits',
            confidence: 'provider',
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
          : identityFromHome,
      lastError: windows.length ? undefined : 'no-usage-signal',
    };
  } catch {
    return { ...account, windows: [], lastError: 'snapshot-unreadable' };
  }
}
