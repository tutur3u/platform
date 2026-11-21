import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { FleetState } from '../fleet/contract';
import { FLEET_STALE_AFTER_MS } from '../fleet/model';
import { formatAge, useI18n } from '../i18n';
import { ReleaseStrip } from './release-strip';
import { Section, SectionMessage } from './section';
import { type Tone, toneBadge, toneDot } from './tone';

const MACHINE_TONE = {
  online: 'green',
  stale: 'yellow',
  offline: 'gray',
} as const;
const LANE_TONE: Record<string, Tone> = {
  running: 'green',
  waiting: 'yellow',
  queued: 'blue',
  idle: 'gray',
  failed: 'red',
};

function Machines({ state, now }: { state: FleetState; now: number }) {
  const { t } = useI18n();
  if (!state.machines.length)
    return <SectionMessage>{t('fleet.noMachines')}</SectionMessage>;
  return (
    <ul className="divide-y border-t">
      {state.machines.map((machine) => {
        const lastSeenAt = machine.lastSeenAt && Date.parse(machine.lastSeenAt);
        const status =
          machine.status === 'online' &&
          lastSeenAt &&
          now - lastSeenAt > FLEET_STALE_AFTER_MS
            ? 'stale'
            : machine.status;
        const lanes = state.lanes.filter(
          (lane) => lane.machineId === machine.id
        );
        const outcomes = machine.todayOutcomes;
        const isToday =
          outcomes &&
          now >= Date.parse(outcomes.dayStart) &&
          now < Date.parse(outcomes.dayStart) + 86_400_000;
        return (
          <li key={machine.id} className="space-y-2 px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium">
                <span className={toneDot(MACHINE_TONE[status])} aria-hidden />
                {machine.label}
                <span className="sr-only">{t(`fleet.machine.${status}`)}</span>
              </div>
              <span className="text-muted-foreground text-sm">
                {[
                  t('fleet.lanes', { n: lanes.length }),
                  t(`fleet.machine.${status}`),
                  lastSeenAt
                    ? t('fleet.seen', {
                        age: formatAge(t, now - lastSeenAt),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              {isToday
                ? t('fleet.outcomes', outcomes)
                : t('fleet.outcomesMissing')}
              {isToday &&
                outcomes.kind === 'partial' &&
                ` · ${t('fleet.outcomesPartial')}`}
              {isToday &&
                now - Date.parse(outcomes.observedAt) > FLEET_STALE_AFTER_MS &&
                ` · ${t('usage.stale')}`}
            </p>
            {lanes.length > 0 && (
              <ul className="divide-y pl-4 text-sm">
                {lanes.map((lane) => (
                  <li key={lane.id} className="flex items-center gap-3 py-1.5">
                    <span
                      className={toneDot(LANE_TONE[lane.state] ?? 'gray')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {lane.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={toneBadge(LANE_TONE[lane.state] ?? 'gray')}
                    >
                      {t(`fleet.lane.${lane.state}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FleetSection({
  state,
  now,
}: {
  state: FleetState;
  now: number;
}) {
  const { t } = useI18n();
  return (
    <Section id="fleet" title={t('nav.fleet')}>
      <ReleaseStrip release={state.release} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-4 md:px-6">
            <CardTitle>{t('fleet.machines')}</CardTitle>
          </CardHeader>
          <Machines state={state} now={now} />
        </Card>
        <Card>
          <CardHeader className="px-4 md:px-6">
            <CardTitle>{t('fleet.quota')}</CardTitle>
            <CardDescription>{t('fleet.quotaEmpty')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </Section>
  );
}
