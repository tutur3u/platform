import { Card } from '@tuturuuu/ui/card';
import {
  FLEET_USAGE_STALE_MS,
  type FleetUsageSnapshot,
} from '../../../web/src/lib/mastermind/fleet/usage-contract';
import { useI18n } from '../i18n';

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
}: {
  title: string;
  rows: [string, number][];
  currency: Intl.NumberFormat;
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
              <span className="break-all">{key}</span>
              <span className="tabular-nums">{currency.format(cost)}</span>
            </div>
            {max > 0 && (
              <meter
                aria-label={key}
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
  const byAccountRows = machines.flatMap((machine) => {
    const accounts = new Map(
      machine.accounts.map((account) => [
        account.id,
        account.email ?? account.instance,
      ])
    );
    return machine.buckets.map((bucket) => ({
      ...bucket,
      accountLabel:
        (bucket.accountId && accounts.get(bucket.accountId)) ||
        t('usage.unattributed'),
    }));
  });
  const byDay = breakdown(rows, (row) => row.day).sort(([a], [b]) =>
    b.localeCompare(a)
  );
  const byModel = breakdown(
    rows,
    (row) => `${row.provider} · ${row.model}`
  ).sort((a, b) => b[1] - a[1]);
  const byAccount = breakdown(byAccountRows, (row) => row.accountLabel).sort(
    (a, b) => b[1] - a[1]
  );
  const incomplete =
    machines.some(
      ({ accounting }) =>
        accounting.kind !== 'complete' ||
        now - Date.parse(accounting.observedAt) > FLEET_USAGE_STALE_MS
    ) || rows.some((row) => row.costUsd === null || row.unpricedRecords > 0);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t('usage.cost')}</h3>
      {incomplete && (
        <p className="text-muted-foreground text-sm">{t('usage.partial')}</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <CostBars title={t('usage.byDay')} rows={byDay} currency={currency} />
        <CostBars
          title={t('usage.byAccount')}
          rows={byAccount}
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
