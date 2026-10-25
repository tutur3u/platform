import { StatTile } from '@tuturuuu/ui/custom/ops';
import type { MachineView } from '@/lib/fleet/fleet-view';
import type { FleetTranslator } from '../../_components/fleet-data';

export function MachineWork({
  machine,
  t,
}: {
  machine: MachineView;
  t: FleetTranslator;
}) {
  const { activity } = machine;
  const unknownLabel = t('resources.unknown');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label={t('work.running')}
          tone={activity?.runningRuns ? 'info' : 'neutral'}
          unknownLabel={unknownLabel}
          value={activity?.runningRuns ?? null}
        />
        <StatTile
          label={t('work.queued')}
          tone={activity?.queuedRuns ? 'warning' : 'neutral'}
          unknownLabel={unknownLabel}
          value={activity?.queuedRuns ?? null}
        />
        <StatTile
          label={t('work.leases')}
          unknownLabel={unknownLabel}
          value={activity?.activeLeases ?? null}
        />
        <StatTile
          label={t('work.kept_leases')}
          unknownLabel={unknownLabel}
          value={activity?.keptLeases ?? null}
        />
        <StatTile
          className="col-span-2 md:col-span-1"
          label={t('work.lane_ceiling')}
          unknownLabel={t('resources.not_reported')}
          value={null}
        />
      </div>
      {activity ? null : (
        <p className="text-muted-foreground text-sm">
          {t('work.activity_unavailable')}
        </p>
      )}
    </div>
  );
}
