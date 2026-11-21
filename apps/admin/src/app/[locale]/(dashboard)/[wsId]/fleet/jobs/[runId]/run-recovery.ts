import type { DevboxAdminRun } from '@/lib/devboxes/admin-store';
import type { RunState } from '@/lib/fleet/run-state';
import type { FleetTranslator } from '../../_components/fleet-data';

/** The one sentence an operator needs about a run's outcome, or null. */
export function getRunRecovery(
  run: DevboxAdminRun,
  state: RunState,
  t: FleetTranslator
) {
  switch (state) {
    case 'outcome_unknown':
    case 'timed_out':
    case 'cancel_requested':
      return t(`jobs.recovery.${state}`);
    case 'failed':
      return t('jobs.recovery.failed', { code: run.exit_code ?? '-' });
    case 'queued':
      return run.runner_id ? null : t('jobs.recovery.queued_unassigned');
    case 'unrecognized':
      return t('jobs.recovery.unrecognized', { status: run.status });
    default:
      return null;
  }
}
