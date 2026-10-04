import { type FlagValue, getFlag } from './args';
import { parseDurationSeconds } from './devbox-duration';

const DEFAULT_UPGRADE_TIMEOUT_SECONDS = 10 * 60;

export function createDevboxUpgradePayload(flags: Record<string, FlagValue>) {
  const runnerId = getFlag(flags, 'runner');
  if (!runnerId) throw new Error('Upgrade requires --runner <id>.');
  return {
    command: ['bun', 'i', '-g', 'tuturuuu'],
    keep: false,
    leaseMode: 'auto' as const,
    runnerId,
    timeoutSeconds:
      parseDurationSeconds(getFlag(flags, 'timeout')) ??
      DEFAULT_UPGRADE_TIMEOUT_SECONDS,
    workload: 'maintenance' as const,
  };
}

export function createDevboxRestartPayload(flags: Record<string, FlagValue>) {
  const runnerId = getFlag(flags, 'runner');
  if (!runnerId) throw new Error('Restart requires --runner <id>.');
  return {
    command: ['__ttr_restart_agent_v1__'],
    keep: false,
    leaseMode: 'auto' as const,
    runnerId,
    timeoutSeconds: 60,
    workload: 'maintenance' as const,
  };
}
