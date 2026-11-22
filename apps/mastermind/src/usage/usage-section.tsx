import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useState } from 'react';
import type { FleetUsageSnapshot } from '../../../web/src/lib/mastermind/fleet/usage-contract';
import { Section, SectionMessage } from '../components/section';
import { FLEET_TIME_ZONE, formatAge, useI18n } from '../i18n';
import { accountStale, readiness, windowKinds } from './model';
import { UsageAccounting } from './usage-accounting';
import { loadUsage } from './server';

type Machine = FleetUsageSnapshot['machines'][number];
type Account = Machine['accounts'][number];
const ALL = '';
const REFRESH_MS = 15_000;
export const USAGE_QUERY_KEY = ['fleet', 'usage'] as const;

function AccountCard({
  account,
  machine,
  now,
}: {
  account: Account;
  machine: Machine;
  now: number;
}) {
  const { locale, t } = useI18n();
  const stale = accountStale(account, now);
  const dt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: FLEET_TIME_ZONE,
  });
  const status = account.status;
  return (
    <Card className="gap-4 p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{account.instance}</h3>
          <p className="text-muted-foreground text-sm">
            {[account.provider, machine.label, account.plan]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Badge
          variant={
            stale || status.kind !== 'limited' ? 'secondary' : 'destructive'
          }
        >
          {t(stale ? 'usage.stale' : `usage.status.${status.kind}`)}
        </Badge>
      </div>
      <div className="space-y-1 break-all text-sm">
        <p>{account.email ?? t('usage.emailUnknown')}</p>
        {status.kind !== 'available' && (
          <p className="text-muted-foreground">
            {t(`usage.reason.${status.reason}`)}
          </p>
        )}
      </div>
      <div className="space-y-3">
        {windowKinds(account).map((kind) => {
          const window = account.windows.find((row) => row.kind === kind);
          const reset = window?.resetsAt;
          const used = window?.usedPercent;
          const label = t(`usage.window.${kind}`);
          return (
            <div key={kind} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>{label}</span>
                <span className="tabular-nums">
                  {used == null ? t('usage.missing') : `${Math.round(used)}%`}
                </span>
              </div>
              {used != null && (
                <meter
                  aria-label={label}
                  className="block h-2 w-full accent-primary"
                  min={0}
                  max={100}
                  value={used}
                />
              )}
              {reset && (
                <p className="text-muted-foreground text-xs">
                  {t('usage.reset', { time: dt.format(new Date(reset)) })}
                  {' · '}
                  {Date.parse(reset) > now
                    ? t('usage.resetIn', {
                        age: formatAge(t, Date.parse(reset) - now),
                      })
                    : t('usage.resetElapsed')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function UsageSection({ now }: { now: number }) {
  const { t } = useI18n();
  const [machineFilter, setMachine] = useState(ALL);
  const [providerFilter, setProvider] = useState(ALL);
  const query = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: () => loadUsage(),
    refetchInterval: REFRESH_MS,
    gcTime: 0,
  });
  const usage = query.data?.kind === 'ready' ? query.data.usage : null;
  const machines = usage?.snapshot.machines ?? [];
  const providers = [
    ...new Set(
      machines.flatMap((machine) => [
        ...machine.accounts.map((account) => account.provider),
        ...machine.buckets.map((bucket) => bucket.provider),
      ])
    ),
  ].sort();
  const filtered = machines
    .filter((machine) => !machineFilter || machine.id === machineFilter)
    .map((machine) => ({
      ...machine,
      accounts: machine.accounts.filter(
        (account) => !providerFilter || account.provider === providerFilter
      ),
      buckets: machine.buckets.filter(
        (bucket) => !providerFilter || bucket.provider === providerFilter
      ),
    }));

  return (
    <Section id="cost" title={t('nav.cost')}>
      {query.isPending ? (
        <div
          aria-label={t('usage.loading')}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : !usage ? (
        <SectionMessage>
          {t(
            query.data?.kind === 'unpublished'
              ? 'usage.unpublished'
              : 'usage.unavailable'
          )}
        </SectionMessage>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <label className="grid gap-1 text-sm">
              {t('usage.machine')}
              <select
                className="rounded-md border bg-background px-3 py-2"
                value={machineFilter}
                onChange={(e) => setMachine(e.target.value)}
              >
                <option value={ALL}>{t('usage.allMachines')}</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {t('usage.provider')}
              <select
                className="rounded-md border bg-background px-3 py-2"
                value={providerFilter}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value={ALL}>{t('usage.allProviders')}</option>
                {providers.map((provider) => (
                  <option key={provider}>{provider}</option>
                ))}
              </select>
            </label>
          </div>
          <Card className="gap-2 p-4">
            <h3 className="font-semibold">{t('usage.readiness')}</h3>
            {filtered.map((machine) => {
              const line = readiness(
                machines.find((full) => full.id === machine.id) ?? machine,
                machine.accounts,
                now
              );
              return (
                <p key={machine.id} className="text-sm">
                  <span className="font-medium">{machine.label}</span>
                  {' · '}
                  {line.kind === 'available'
                    ? line.instances.join(', ')
                    : line.kind === 'unread' && line.reason
                      ? t(`usage.unread.${line.reason}`)
                      : line.kind === 'none_available'
                        ? t('usage.noneAvailable')
                        : t('usage.noConfirmedQuota')}
                </p>
              );
            })}
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.flatMap((machine) =>
              machine.accounts.map((account) => (
                <AccountCard
                  key={`${machine.id}:${account.id}`}
                  account={account}
                  machine={machine}
                  now={now}
                />
              ))
            )}
          </div>
          <UsageAccounting machines={filtered} now={now} />
        </>
      )}
    </Section>
  );
}
