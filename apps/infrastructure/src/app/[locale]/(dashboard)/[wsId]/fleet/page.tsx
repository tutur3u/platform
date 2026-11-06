import {
  AlertTriangle,
  CircleHelp,
  Clock,
  Play,
  RotateCcw,
  Server,
} from '@tuturuuu/icons';
import {
  OpsPageHeader,
  OpsSection,
  StatePanel,
  StatTile,
} from '@tuturuuu/ui/custom/ops';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { buildFleetView } from '@/lib/fleet/fleet-view';
import { formatUtcTime } from '@/lib/fleet/format';
import { loadFleetPage } from './_components/fleet-data';
import { MachineCard } from './_components/machine-card';

export const metadata: Metadata = {
  title: 'Fleet',
  description: 'Machines, trust, resource pressure and work across the fleet.',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

const linkButtonClassName =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4';

export default async function FleetPage({ params }: Props) {
  await connection();
  const { wsId } = await params;
  const { locale, now, result, t } = await loadFleetPage(wsId);

  const header = (
    <OpsPageHeader
      actions={
        <>
          <Link className={linkButtonClassName} href={`/${wsId}/fleet`}>
            <RotateCcw />
            {t('refresh')}
          </Link>
          <Link className={linkButtonClassName} href={`/${wsId}/devboxes`}>
            {t('manage')}
          </Link>
        </>
      }
      icon={<Server />}
      meta={<span>{t('snapshot', { time: formatUtcTime(now, locale) })}</span>}
      title={t('title')}
    />
  );

  if (!result.ok) {
    return (
      <div className="space-y-4">
        {header}
        <StatePanel
          detail={t('errors.snapshot_detail')}
          icon={<AlertTriangle />}
          title={t('errors.snapshot_title')}
          tone="critical"
        />
      </div>
    );
  }

  const fleet = buildFleetView(result.snapshot, now);
  const machineHref = (id: string) => `/${wsId}/fleet/machines/${id}`;
  const visibleMachines = fleet.machines.filter(
    (machine) => machine.status.state !== 'revoked'
  );
  const runWindow = t('stats.run_window', { count: fleet.counts.runWindow });

  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          detail={t('stats.of_machines', { count: fleet.counts.machines })}
          icon={<Server />}
          label={t('stats.online')}
          tone={fleet.counts.online > 0 ? 'positive' : 'neutral'}
          unknownLabel={t('resources.unknown')}
          value={fleet.counts.online}
        />
        <StatTile
          href={fleet.counts.attention > 0 ? '#machines' : undefined}
          icon={<AlertTriangle />}
          label={t('stats.attention')}
          tone={fleet.counts.attention > 0 ? 'warning' : 'neutral'}
          unknownLabel={t('resources.unknown')}
          value={fleet.counts.attention}
        />
        <StatTile
          detail={runWindow}
          icon={<Clock />}
          href={`/${wsId}/fleet/jobs?state=queued`}
          label={t('stats.queued')}
          tone={fleet.counts.queued > 0 ? 'warning' : 'neutral'}
          unknownLabel={t('resources.unknown')}
          value={fleet.counts.queued}
        />
        <StatTile
          detail={runWindow}
          icon={<Play />}
          href={`/${wsId}/fleet/jobs?state=running`}
          label={t('stats.running')}
          tone={fleet.counts.running > 0 ? 'info' : 'neutral'}
          unknownLabel={t('resources.unknown')}
          value={fleet.counts.running}
        />
        <StatTile
          className="col-span-2 lg:col-span-1"
          detail={runWindow}
          icon={<CircleHelp />}
          href={`/${wsId}/fleet/jobs?state=unknown`}
          label={t('stats.outcome_unknown')}
          tone={fleet.counts.outcomeUnknown > 0 ? 'unknown' : 'neutral'}
          unknownLabel={t('resources.unknown')}
          value={fleet.counts.outcomeUnknown}
        />
      </div>

      {visibleMachines.length === 0 ? (
        <StatePanel
          detail={t('empty.machines_detail')}
          icon={<Server />}
          title={t('empty.machines_title')}
        />
      ) : (
        <OpsSection
          count={visibleMachines.length}
          flush
          id="machines"
          title={t('sections.machines')}
        >
          <div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {visibleMachines.map((machine) => (
              <MachineCard
                href={machineHref(machine.id)}
                key={machine.id}
                locale={locale}
                machine={machine}
                now={now}
                t={t}
              />
            ))}
          </div>
        </OpsSection>
      )}
    </div>
  );
}
