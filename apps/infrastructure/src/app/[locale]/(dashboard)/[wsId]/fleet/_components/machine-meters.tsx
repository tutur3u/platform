import { ResourceMeter } from '@tuturuuu/ui/custom/ops';
import { cn } from '@tuturuuu/utils/format';
import type { MachineView } from '@/lib/fleet/fleet-view';
import { formatGiB } from '@/lib/fleet/format';
import type { FleetTranslator } from './fleet-data';

export function MachineMeters({
  className,
  machine,
  t,
}: {
  className?: string;
  machine: MachineView;
  t: FleetTranslator;
}) {
  const { telemetry } = machine;
  const stale = machine.status.telemetry !== 'fresh';
  const unknownLabel =
    machine.status.telemetry === 'missing'
      ? t('resources.not_reported')
      : t('resources.unknown');
  const memoryUsed = formatGiB(telemetry.memoryUsedBytes);
  const memoryTotal = formatGiB(telemetry.memoryTotalBytes);
  const diskUsedPercent =
    telemetry.diskFreePercent === null ? null : 100 - telemetry.diskFreePercent;

  return (
    <div className={cn('grid gap-3', className)}>
      <ResourceMeter
        display={
          telemetry.loadPerCorePercent === null
            ? undefined
            : `${Math.round(telemetry.loadPerCorePercent)}%`
        }
        label={t('resources.load')}
        percent={
          telemetry.loadPerCorePercent === null
            ? null
            : Math.min(telemetry.loadPerCorePercent, 100)
        }
        stale={stale}
        unknownLabel={unknownLabel}
      />
      <ResourceMeter
        display={
          memoryUsed && memoryTotal
            ? `${memoryUsed} / ${memoryTotal}`
            : undefined
        }
        label={t('resources.memory')}
        percent={telemetry.memoryUsedPercent}
        stale={stale}
        unknownLabel={unknownLabel}
      />
      <ResourceMeter
        display={
          telemetry.diskFreeGiB === null
            ? undefined
            : t('resources.disk_free', { free: telemetry.diskFreeGiB })
        }
        label={t('resources.disk')}
        percent={diskUsedPercent}
        stale={stale}
        unknownLabel={unknownLabel}
      />
    </div>
  );
}
