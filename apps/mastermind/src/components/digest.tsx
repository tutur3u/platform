import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { FleetSnapshot } from '../fleet/contract';
import { digest } from '../fleet/model';
import { useSnoozes } from '../fleet/snooze';
import { formatTime, type Translate, useI18n } from '../i18n';

function summary(
  t: Translate,
  snapshot: FleetSnapshot,
  d: ReturnType<typeof digest>
) {
  const main = snapshot.state.release?.main;
  const parts = [
    t('now.lanes', {
      running: d.running,
      online: d.machinesOnline,
      machines: d.machines,
    }),
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

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="mb-2 font-medium text-muted-foreground text-sm">
        {label}
      </div>
      <div className="font-bold text-2xl tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

/** "What's happening now": one sentence from live counts, then four KPIs. */
export function Digest({
  snapshot,
  now,
}: {
  snapshot: FleetSnapshot;
  now: number;
}) {
  const { t, locale } = useI18n();
  const d = digest(snapshot, useSnoozes(), now);
  return (
    <Card id="overview" className="scroll-mt-20">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 p-4 md:p-6">
        <CardTitle>{t('now.title')}</CardTitle>
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
          <Kpi label={t('kpi.needYou')} value={d.needYou} />
          <Kpi label={t('kpi.logins')} value={d.logins.length} />
          <Kpi
            label={t('kpi.machines')}
            value={`${d.machinesOnline}/${d.machines}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
