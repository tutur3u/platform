import { AlertTriangle, ArrowLeft, Server } from '@tuturuuu/icons';
import {
  OpsPageHeader,
  OpsSection,
  StatePanel,
  StatusPill,
} from '@tuturuuu/ui/custom/ops';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { buildFleetView } from '@/lib/fleet/fleet-view';
import { formatUtcTime } from '@/lib/fleet/format';
import { MACHINE_STATE_TONE } from '@/lib/fleet/machine-state';
import { setDevboxRunnerDrainAction } from '../../../devboxes/actions';
import { loadFleetPage } from '../../_components/fleet-data';
import { MachineMeters } from '../../_components/machine-meters';
import { getMachineRecovery } from '../../_components/machine-recovery';
import { MachineStatePill } from '../../_components/machine-state-pill';
import { MachineIdentityFacts, MachineIsolationFacts } from './machine-facts';
import { MachineRuns } from './machine-runs';
import { MachineWork } from './machine-work';

export const metadata: Metadata = {
  title: 'Machine',
  description: 'State, trust, resources and work for one fleet machine.',
};

interface Props {
  params: Promise<{ runnerId: string; wsId: string }>;
}

const buttonClassName =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-4';

export default async function FleetMachinePage({ params }: Props) {
  await connection();
  const { runnerId, wsId } = await params;
  const { canManage, locale, now, result, t } = await loadFleetPage(wsId);

  const backLink = (
    <Link className={buttonClassName} href={`/${wsId}/fleet`}>
      <ArrowLeft />
      {t('actions.all_machines')}
    </Link>
  );
  const fleet = result.ok ? buildFleetView(result.snapshot, now) : null;
  const machine = fleet?.machines.find((entry) => entry.id === runnerId);

  if (!fleet || !machine) {
    return (
      <div className="space-y-4">
        <OpsPageHeader
          actions={backLink}
          icon={<Server />}
          title={t('title')}
        />
        <StatePanel
          detail={
            fleet
              ? t('errors.machine_missing_detail')
              : t('errors.snapshot_detail')
          }
          icon={<AlertTriangle />}
          title={
            fleet
              ? t('errors.machine_missing_title')
              : t('errors.snapshot_title')
          }
          tone={fleet ? 'neutral' : 'critical'}
        />
      </div>
    );
  }

  const { state } = machine.status;
  const recovery = getMachineRecovery(machine, { locale, now, t });
  const draining = Boolean(machine.drainRequestedAt);
  const canDrain = canManage && state !== 'revoked';
  const runs = fleet.runs.filter((entry) => entry.run.runner_id === machine.id);

  return (
    <div className="space-y-4">
      <OpsPageHeader
        actions={
          <>
            {backLink}
            {canDrain ? (
              <form
                action={setDevboxRunnerDrainAction.bind(
                  null,
                  wsId,
                  machine.id,
                  !draining
                )}
              >
                <button className={buttonClassName} type="submit">
                  {draining ? t('actions.undrain') : t('actions.drain')}
                </button>
              </form>
            ) : null}
          </>
        }
        icon={<Server />}
        meta={
          <>
            <MachineStatePill state={state} t={t} />
            <StatusPill
              tone={
                machine.status.trust === 'trusted'
                  ? 'positive'
                  : machine.status.trust === 'revoked'
                    ? 'neutral'
                    : 'critical'
              }
            >
              {t(`trust.${machine.status.trust}`)}
            </StatusPill>
            <span>{t('snapshot', { time: formatUtcTime(now, locale) })}</span>
          </>
        }
        title={machine.name}
      />

      {recovery ? (
        <StatePanel title={recovery} tone={MACHINE_STATE_TONE[state]} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <OpsSection
          actions={
            machine.status.telemetry === 'fresh' ? null : (
              <StatusPill tone="unknown">
                {t(`telemetry.${machine.status.telemetry}`)}
              </StatusPill>
            )
          }
          title={t('sections.resources')}
        >
          <MachineMeters machine={machine} t={t} />
        </OpsSection>
        <OpsSection title={t('sections.work')}>
          <MachineWork machine={machine} t={t} />
        </OpsSection>
      </div>

      <OpsSection count={runs.length} flush title={t('sections.recent_runs')}>
        <MachineRuns locale={locale} runs={runs} t={t} wsId={wsId} />
      </OpsSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <OpsSection title={t('sections.identity')}>
          <MachineIdentityFacts
            locale={locale}
            machine={machine}
            now={now}
            t={t}
          />
        </OpsSection>
        <OpsSection title={t('sections.isolation')}>
          <MachineIsolationFacts machine={machine} t={t} />
        </OpsSection>
      </div>
    </div>
  );
}
