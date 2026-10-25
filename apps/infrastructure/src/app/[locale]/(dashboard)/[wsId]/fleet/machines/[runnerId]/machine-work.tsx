import { StatTile } from '@tuturuuu/ui/custom/ops';
import type { MachineView } from '@/lib/fleet/fleet-view';
import { UNREACHABLE_MACHINE_STATES } from '@/lib/fleet/run-state';
import type { FleetTranslator } from '../../_components/fleet-data';

export function MachineWork({
  machine,
  t,
}: {
  machine: MachineView;
  t: FleetTranslator;
}) {
  const { activity } = machine;
  // Active work on a machine we cannot hear is unconfirmed, not running.
  const unreachable = UNREACHABLE_MACHINE_STATES.has(machine.status.state);
  const unknownLabel = t('resources.unknown');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label={unreachable ? t('stats.outcome_unknown') : t('work.running')}
          tone={
            activity?.runningRuns
              ? unreachable
                ? 'unknown'
                : 'info'
              : 'neutral'
          }
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
          className="col-span-2 sm:col-span-1"
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
