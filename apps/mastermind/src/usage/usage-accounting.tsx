import { Card } from '@tuturuuu/ui/card';
import type { FleetUsageSnapshot } from '../../../web/src/lib/mastermind/fleet/usage-contract';
import { useI18n } from '../i18n';
import { accountingGaps, hasAccountingGaps } from './model';

type Machine = FleetUsageSnapshot['machines'][number];
type Bucket = Machine['buckets'][number];

function breakdown<T extends Bucket>(
  rows: readonly T[],
  group: (row: T) => string
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.costUsd === null) continue;
    const key = group(row);
    totals.set(key, (totals.get(key) ?? 0) + row.costUsd);
  }
  return [...totals];
}

function CostBars({
  title,
  rows,
  currency,
  labels,
}: {
  title: string;
  rows: [string, number][];
  currency: Intl.NumberFormat;
  labels?: ReadonlyMap<string, string>;
}) {
  const { t } = useI18n();
  const max = Math.max(0, ...rows.map(([, cost]) => cost));
  return (
    <Card className="min-w-0 gap-3 p-4">
      <h4 className="font-medium">{title}</h4>
      {!rows.length && (
        <p className="text-muted-foreground text-sm">{t('usage.missing')}</p>
      )}
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {rows.map(([key, cost]) => (
          <li key={key} className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <span className="break-all">{labels?.get(key) ?? key}</span>
              <span className="tabular-nums">{currency.format(cost)}</span>
            </div>
            {max > 0 && (
              <meter
                aria-label={labels?.get(key) ?? key}
                className="block h-2 w-full accent-primary"
                min={0}
                max={max}
                value={cost}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function UsageAccounting({
  machines,
  now,
}: {
  machines: readonly Machine[];
  now: number;
}) {
  const { locale, t } = useI18n();
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  });
  const count = new Intl.NumberFormat(locale);
  const rows = machines.flatMap((machine) => machine.buckets);
  const accounts = new Map<string, [string, number]>();
  for (const machine of machines) {
    const byId = new Map(
      machine.accounts.map((account) => [account.id, account])
    );
    for (const bucket of machine.buckets) {
      if (bucket.costUsd === null) continue;
      const account = bucket.accountId ? byId.get(bucket.accountId) : undefined;
      const key = account?.email
        ? JSON.stringify(['email', account.email])
        : account
          ? JSON.stringify(['instance', machine.id, account.id])
          : 'unattributed';
      const label =
        account?.email ??
        (account
          ? `${machine.label} · ${account.provider} · ${account.instance}`
          : t('usage.unattributed'));
      accounts.set(key, [
        label,
        (accounts.get(key)?.[1] ?? 0) + bucket.costUsd,
      ]);
    }
  }
  const byDay = breakdown(rows, (row) => row.day).sort(([a], [b]) =>
    b.localeCompare(a)
  );
  const byModel = breakdown(
    rows,
    (row) => `${row.provider} · ${row.model}`
  ).sort((a, b) => b[1] - a[1]);
  const byAccount = [...accounts].sort((a, b) => b[1][1] - a[1][1]);
  const gaps = accountingGaps(machines, rows, now);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t('usage.cost')}</h3>
      {hasAccountingGaps(gaps) && (
        <div className="space-y-1 text-muted-foreground text-sm">
          <p>{t('usage.partial')}</p>
          {gaps.unread.length > 0 && (
            <p>{t('usage.gap.unread', { machines: gaps.unread.join(', ') })}</p>
          )}
          {gaps.partial.length > 0 && (
            <p>
              {t('usage.gap.partial', { machines: gaps.partial.join(', ') })}
            </p>
          )}
          {gaps.stale.length > 0 && (
            <p>{t('usage.gap.stale', { machines: gaps.stale.join(', ') })}</p>
          )}
          {gaps.unpriced > 0 && (
            <p>
              {t('usage.gap.unpriced', { count: count.format(gaps.unpriced) })}
            </p>
          )}
          {gaps.unpricedUncounted && <p>{t('usage.gap.unpricedUncounted')}</p>}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <CostBars title={t('usage.byDay')} rows={byDay} currency={currency} />
        <CostBars
          title={t('usage.byAccount')}
          rows={byAccount.map(([key, [, cost]]) => [key, cost])}
          labels={new Map(byAccount.map(([key, [label]]) => [key, label]))}
          currency={currency}
        />
        <CostBars
          title={t('usage.byModel')}
          rows={byModel}
          currency={currency}
        />
      </div>
      <Card className="gap-3 p-4">
        <h3 className="font-semibold">{t('usage.tokens')}</h3>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(
                  [
                    'machine',
                    'day',
                    'provider',
                    'model',
                    'input',
                    'cacheRead',
                    'cacheWrite',
                    'output',
                  ] as const
                ).map((key) => (
                  <th
                    className="whitespace-nowrap px-2 py-1"
                    key={key}
                    scope="col"
                  >
                    {t(`usage.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {machines.flatMap((machine) =>
                machine.buckets.map((row, index) => (
                  <tr className="border-t" key={`${machine.id}:${index}`}>
                    {[
                      machine.label,
                      row.day,
                      row.provider,
                      row.model,
                      count.format(row.uncachedInputTokens),
                      count.format(row.cachedInputTokens),
                      count.format(row.cacheCreationTokens),
                      count.format(row.outputTokens),
                    ].map((value, cell) => (
                      <td
                        key={cell}
                        className="whitespace-nowrap px-2 py-1 tabular-nums"
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('usage.missing')}</p>
        )}
      </Card>
    </div>
  );
}
