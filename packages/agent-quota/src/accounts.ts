import type { AccountUsage } from './types';

export function collapseAccounts(
  accounts: AccountUsage[],
  model?: string
): AccountUsage[] {
  const groups = new Map<string, AccountUsage[]>();
  for (const account of accounts) {
    const key = account.accountIdentityHash
      ? `${account.provider}:account:${account.accountIdentityHash}`
      : `${account.provider}:instance:${account.instanceId}`;
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }
  return [...groups.values()].map((group) => {
    const ordered = [...group].sort((a, b) =>
      a.instanceId.localeCompare(b.instanceId)
    );
    const first =
      ordered.find(
        (account) =>
          account.available !== false &&
          (!model || account.models?.includes(model))
      ) ?? ordered[0];
    if (!first) throw new Error('Empty account group');
    return {
      ...first,
      instanceIds: ordered.map((account) => account.instanceId),
      windows: [
        ...ordered
          .flatMap((account) => account.windows)
          .reduce((windows, window) => {
            const key = JSON.stringify([
              window.id ?? window.kind,
              window.scope ?? { kind: 'account' },
            ]);
            const previous = windows.get(key);
            if (
              !previous ||
              Date.parse(window.observedAt) > Date.parse(previous.observedAt) ||
              (window.observedAt === previous.observedAt &&
                (window.usedPercent ?? -1) > (previous.usedPercent ?? -1))
            )
              windows.set(key, window);
            return windows;
          }, new Map<string, AccountUsage['windows'][number]>())
          .values(),
      ],
      alias:
        ordered.length > 1
          ? `Shared account identity: ${ordered.map((account) => account.instanceId).join(', ')}; reservations combined.`
          : first.accountIdentityHash
            ? 'Account identity established from provider metadata or the configured account-home mapping; display labels remain aliases.'
            : 'Account identity unavailable; display labels are aliases, not account identity. Instances remain separate.',
    };
  });
}

export function accountKey(account: AccountUsage): string {
  return `${account.provider}:${account.accountIdentityHash ? `account:${account.accountIdentityHash}` : `instance:${account.instanceId}`}`;
}
