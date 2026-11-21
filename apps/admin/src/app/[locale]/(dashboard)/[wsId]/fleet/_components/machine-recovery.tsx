import { opsToneClasses } from '@tuturuuu/ui/custom/ops';
import { cn } from '@tuturuuu/utils/format';
import type { MachineView } from '@/lib/fleet/fleet-view';
import { ageSince, formatAge } from '@/lib/fleet/format';
import { MACHINE_STATE_TONE } from '@/lib/fleet/machine-state';
import type { FleetTranslator } from './fleet-data';

/** The one sentence an operator needs for a non-online machine, or null. */
export function getMachineRecovery(
  machine: MachineView,
  { locale, now, t }: { locale: string; now: Date; t: FleetTranslator }
) {
  const { state } = machine.status;
  if (state === 'online') return null;

  const age =
    state === 'draining'
      ? formatAge(ageSince(machine.drainRequestedAt, now), locale)
      : formatAge(machine.status.heartbeatAgeMs, locale);

  return t(`recovery.${state}`, { age: age ?? t('facts.never') });
}

export function MachineRecoveryText({
  className,
  machine,
  ...context
}: {
  className?: string;
  locale: string;
  machine: MachineView;
  now: Date;
  t: FleetTranslator;
}) {
  const text = getMachineRecovery(machine, context);
  if (!text) return null;

  return (
    <p
      className={cn(
        'text-sm',
        opsToneClasses[MACHINE_STATE_TONE[machine.status.state]].text,
        className
      )}
    >
      {text}
    </p>
  );
}
