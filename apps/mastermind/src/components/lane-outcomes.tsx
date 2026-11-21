import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { FleetState } from '../fleet/contract';
import { formatTime, useI18n } from '../i18n';
import { toneDot } from './tone';

/**
 * Lanes that ended without a real failure, counted apart from failures, and
 * the failures nobody has picked up again.
 */
export function LaneOutcomes({ state }: { state: FleetState }) {
  const { t, locale } = useI18n();
  const { cancelled = 0, quotaRecovered = 0, recovered = 0 } = state.counts;
  const settled = cancelled + quotaRecovered + recovered;
  const failed = state.lanes.filter((lane) => lane.state === 'failed');
  const machine = (id: string) =>
    state.machines.find((m) => m.id === id)?.label ?? id;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{t('outcomes.settled')}</CardTitle>
            <span className="font-bold text-xl tabular-nums">{settled}</span>
          </div>
          <CardDescription>{t('outcomes.settledNote')}</CardDescription>
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                [cancelled, 'outcomes.cancelled'],
                [quotaRecovered, 'outcomes.quotaRecovered'],
                [recovered, 'outcomes.recovered'],
              ] as const
            ).map(([value, label]) => (
              <div key={label}>
                <dd className="font-semibold text-lg tabular-nums">{value}</dd>
                <dt className="text-muted-foreground text-xs">{t(label)}</dt>
              </div>
            ))}
          </dl>
        </CardHeader>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="p-4">
          <CardTitle className="text-base">{t('outcomes.failed')}</CardTitle>
        </CardHeader>
        {failed.length ? (
          <ul className="divide-y border-t">
            {failed.map((lane) => (
              <li key={lane.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className={toneDot('red', 'mt-1.5')} aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{lane.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {[
                      machine(lane.machineId),
                      lane.project,
                      formatTime(locale, lane.updatedAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t px-4 py-4 text-muted-foreground text-sm">
            {t('outcomes.noFailed')}
          </p>
        )}
      </Card>
    </div>
  );
}
