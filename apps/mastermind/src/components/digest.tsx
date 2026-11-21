import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { FleetSnapshot } from '../fleet/contract';
import { inboxLanes } from '../fleet/inbox-lanes';
import { digest } from '../fleet/model';
import { useSnoozes } from '../fleet/snooze';
import { formatTime, type Translate, useI18n } from '../i18n';
import { LaneOutcomes } from './lane-outcomes';

function summary(
  t: Translate,
  snapshot: FleetSnapshot,
  d: ReturnType<typeof digest>
) {
  const main = snapshot.state.release?.main;
  const counts = snapshot.state.counts;
  const settled =
    (counts.recovered ?? 0) +
    (counts.quotaRecovered ?? 0) +
    (counts.cancelled ?? 0);
  const parts = [
    ...(settled ? [t('now.settled', { n: settled })] : []),
    t('now.machines', { online: d.machinesOnline, machines: d.machines }),
  ];
  if (main?.state === 'frozen')
    parts.push(
      main.reason && main.queued
        ? t('now.frozenQueued', { reason: main.reason, queued: main.queued })
        : main.reason
          ? t('now.frozen', { reason: main.reason })
          : t('now.frozenPlain')
    );
  if (d.logins.length)
    parts.push(
      t('now.logins', {
        list: d.logins
          .map((login) =>
            [login.service, login.machine].filter(Boolean).join(' · ')
          )
          .join(', '),
      })
    );
  if (!d.needYou && !d.logins.length) parts.push(t('now.calm'));
  return parts.join(' ');
}

function Kpi({
  label,
  value,
  alarm,
}: {
  label: string;
  value: string | number;
  alarm?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 font-medium text-muted-foreground text-sm">
        {label}
      </div>
      <div
        className={cn(
          'font-bold text-2xl tabular-nums tracking-tight',
          alarm && 'text-dynamic-red'
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Today: the headline counts only failures nobody picked up again, then
 * four KPIs, then the recovered or cancelled breakdown and the failed list.
 */
export function Digest({
  snapshot,
  now,
}: {
  snapshot: FleetSnapshot;
  now: number;
}) {
  const { t, locale } = useI18n();
  const snoozes = useSnoozes();
  const d = digest(snapshot, snoozes, now);
  // The same count as the Inbox badge: asks, reviews and open sign-ins.
  const needYou = inboxLanes(snapshot, snoozes, now).needs.length;
  const failed = snapshot.state.counts.failed;
  return (
    <section id="overview" className="scroll-mt-20 space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 p-4 md:p-6">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">{t('now.title')}</p>
            <CardTitle className="text-xl">
              {t('now.headline', { running: d.running, failed })}
            </CardTitle>
          </div>
          <span className="text-muted-foreground text-sm">
            {t('now.when', {
              time: formatTime(locale, snapshot.state.generatedAt),
            })}
          </span>
        </CardHeader>
        <CardContent className="space-y-6 px-4 pb-4 md:px-6 md:pb-6">
          <p className="max-w-3xl text-sm">{summary(t, snapshot, d)}</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label={t('kpi.running')} value={d.running} />
            <Kpi label={t('kpi.needYou')} value={needYou} />
            <Kpi label={t('kpi.logins')} value={d.logins.length} />
            <Kpi label={t('kpi.failed')} value={failed} alarm={failed > 0} />
          </div>
        </CardContent>
      </Card>
      <LaneOutcomes state={snapshot.state} />
    </section>
  );
}
