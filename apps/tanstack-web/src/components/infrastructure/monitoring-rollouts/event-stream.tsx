'use client';

import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { formatClockTime } from './formatters';
import type { MonitoringRolloutsTranslations } from './state';

export function RolloutEventStream({
  snapshot,
  t,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringRolloutsTranslations;
}) {
  const events = snapshot.watcher.events.slice(0, 8);

  return (
    <section className="rounded-lg border border-border/60 bg-background p-5">
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
          {t('rollouts.events_title')}
        </p>
        <h3 className="mt-1 font-semibold text-lg">{t('events.title')}</h3>
      </div>

      {events.length > 0 ? (
        <div className="mt-4 space-y-3">
          {events.map((event) => (
            <div
              className="rounded-lg border border-border/60 bg-muted/20 p-3"
              key={`${event.time}:${event.level}:${event.message}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full" variant="outline">
                  {event.level}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatClockTime(event.time)}
                </span>
              </div>
              <p className="mt-2 text-sm">{event.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border/60 border-dashed bg-muted/20 p-6 text-center text-muted-foreground text-sm">
          {t('empty.events')}
        </div>
      )}
    </section>
  );
}
