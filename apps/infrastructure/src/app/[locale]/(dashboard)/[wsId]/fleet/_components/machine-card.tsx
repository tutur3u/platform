import { StatusPill } from '@tuturuuu/ui/custom/ops';
import Link from 'next/link';
import type { MachineView } from '@/lib/fleet/fleet-view';
import type { FleetTranslator } from './fleet-data';
import { MachineMeters } from './machine-meters';
import { MachineRecoveryText } from './machine-recovery';
import { MachineStatePill } from './machine-state-pill';

export function MachineCard({
  href,
  locale,
  machine,
  now,
  t,
}: {
  href: string;
  locale: string;
  machine: MachineView;
  now: Date;
  t: FleetTranslator;
}) {
  const { telemetry } = machine;
  const platform = [telemetry.platform, telemetry.arch]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link
              className="hover:underline focus-visible:underline focus-visible:outline-none"
              href={href}
            >
              {machine.name}
            </Link>
          </h3>
          <p className="truncate text-muted-foreground text-xs">
            {[telemetry.hostname, platform, telemetry.cliVersion]
              .filter(Boolean)
              .join(' · ') || t('facts.not_reported')}
          </p>
        </div>
        <MachineStatePill state={machine.status.state} t={t} />
      </header>

      <MachineRecoveryText locale={locale} machine={machine} now={now} t={t} />

      <MachineMeters machine={machine} t={t} />

      <footer className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-3 text-muted-foreground text-xs">
        <span className="tabular-nums">
          {machine.activity
            ? t('work.summary', {
                queued: machine.activity.queuedRuns,
                running: machine.activity.runningRuns,
              })
            : t('resources.unknown')}
        </span>
        {machine.status.telemetry === 'fresh' ? null : (
          <StatusPill tone="unknown">
            {t(`telemetry.${machine.status.telemetry}`)}
          </StatusPill>
        )}
      </footer>
    </article>
  );
}
