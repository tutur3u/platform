'use client';

import type {
  DeployEnvironmentName,
  DeployEnvironmentResult,
  DeployLane,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { PendingAction } from './deployment-action-dialog';
import { DeploymentTable } from './deployment-table';
import { laneRecords } from './deployment-view';

export function DeploymentEnvironment({
  environment,
  result,
  canOperate,
  onAction,
}: {
  environment: DeployEnvironmentName;
  result: DeployEnvironmentResult;
  canOperate: boolean;
  onAction: (pending: PendingAction) => void;
}) {
  const t = useTranslations('deployments');
  const headingId = `deployments-${environment}`;
  const state = result.ok ? result.state : null;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id={headingId} className="font-semibold text-base tracking-tight">
            {t(`environments.${environment}`)}
          </h2>
          {state?.stopped && <Badge variant="error">{t('stopped')}</Badge>}
        </div>
        {/* Stop stays available when the read fails: it is the emergency
            control, and the coordinator answers a repeated stop idempotently. */}
        {canOperate && (
          <Button
            size="sm"
            variant={state?.stopped ? 'secondary' : 'outline'}
            onClick={() =>
              onAction({
                environment,
                action: state?.stopped ? 'resume' : 'stop',
              })
            }
          >
            {t(state?.stopped ? 'actions.resume' : 'actions.stop')}
          </Button>
        )}
      </div>
      {state?.stopped && state.stopReason && (
        <p className="text-muted-foreground text-sm">{state.stopReason}</p>
      )}
      <div className="divide-y rounded-lg border bg-card">
        {result.ok ? (
          result.state.lanes.length === 0 ? (
            <p className="px-4 py-4 text-muted-foreground text-sm md:px-5">
              {t('no_deployments')}
            </p>
          ) : (
            result.state.lanes.map((lane) => (
              <DeploymentLane
                key={lane.lane}
                environment={environment}
                lane={lane}
                canOperate={canOperate}
                onAction={onAction}
              />
            ))
          )
        ) : (
          <p
            role="alert"
            className="px-4 py-4 text-dynamic-red text-sm md:px-5"
          >
            {t('environment_error', { code: result.error })}
          </p>
        )}
      </div>
    </section>
  );
}

function DeploymentLane({
  environment,
  lane,
  canOperate,
  onAction,
}: {
  environment: DeployEnvironmentName;
  lane: DeployLane;
  canOperate: boolean;
  onAction: (pending: PendingAction) => void;
}) {
  const t = useTranslations('deployments');
  const showName = environment === 'preview' || lane.lane !== 'default';
  if (!showName && !lane.held && laneRecords(lane).length === 0) return null;
  return (
    <div className="space-y-3 px-4 py-4 md:px-5">
      {(showName || lane.held) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {showName && (
              <span className="truncate font-medium font-mono text-sm">
                {lane.lane}
              </span>
            )}
            {lane.held && <Badge variant="warning">{t('held')}</Badge>}
          </div>
          {lane.held && canOperate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                onAction({
                  environment,
                  action: 'release-hold',
                  lane: lane.lane,
                })
              }
            >
              {t('actions.release-hold')}
            </Button>
          )}
        </div>
      )}
      {laneRecords(lane).length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('no_deployments')}</p>
      ) : (
        <DeploymentTable
          environment={environment}
          lane={lane}
          canOperate={canOperate}
          onAction={onAction}
        />
      )}
    </div>
  );
}
