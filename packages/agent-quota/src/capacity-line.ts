import { SIGNAL_TTL_MS } from './policy';
import type { AccountUsage, UsageWindow } from './types';
import {
  windowHasCurrentReset,
  windowObservationIsFresh,
} from './window-freshness';

function remaining(windows: UsageWindow[], duration: 300 | 10080): string {
  const providerKind = duration === 300 ? 'session' : 'weekly';
  const values = windows.flatMap((window) =>
    (window.providerWindowKind === providerKind ||
      window.windowDurationMins === duration ||
      (window.providerWindowKind === undefined &&
        window.kind === providerKind)) &&
    window.usedPercent !== undefined
      ? [100 - window.usedPercent]
      : []
  );
  return values.length ? `${Math.floor(Math.min(...values))}%` : 'unknown';
}

export function capacityLine(accounts: AccountUsage[], now: Date): string {
  return accounts
    .flatMap((account) => {
      if (!['codex', 'claude', 'antigravity'].includes(account.provider))
        return [];
      const windows = account.windows.filter(
        (window) =>
          window.authoritative &&
          windowHasCurrentReset(window, now) &&
          windowObservationIsFresh(window, now, SIGNAL_TTL_MS[account.provider])
      );
      const pair = (items: UsageWindow[]) =>
        `5h=${remaining(items, 300)} week=${remaining(items, 10080)}`;
      if (account.provider === 'antigravity') {
        return ['gemini', '3p'].map(
          (pool) =>
            `${account.instanceId}/${pool === '3p' ? 'claude-gpt' : pool} ${pair(
              windows.filter(
                (window) =>
                  window.id === `${pool}-5h` || window.id === `${pool}-weekly`
              )
            )}`
        );
      }
      return `${account.instanceId} ${pair(
        windows.filter(
          (window) =>
            window.scope?.kind !== 'models' && window.scope?.kind !== 'unknown'
        )
      )}`;
    })
    .join(' | ');
}
