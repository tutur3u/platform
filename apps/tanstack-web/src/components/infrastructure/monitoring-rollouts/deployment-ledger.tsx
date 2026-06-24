'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import type { BlueGreenMonitoringDeploymentRollup } from './deployments';
import {
  formatCompactNumber,
  formatDateTime,
  formatDuration,
  getDeploymentStatusTranslationKey,
} from './formatters';
import type { MonitoringRolloutsTranslations } from './state';

function statusTone(status: string | null | undefined) {
  if (status === 'failed' || status === 'canceled') {
    return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
  }

  if (status === 'building' || status === 'deploying') {
    return 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue';
  }

  if (status === 'successful' || status === 'active') {
    return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
  }

  return 'border-border/70 bg-muted/40 text-muted-foreground';
}

export function DeploymentLedger({
  deployments,
  t,
}: {
  deployments: BlueGreenMonitoringDeploymentRollup[];
  t: MonitoringRolloutsTranslations;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="border-border/60 border-b p-5">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
          {t('panels.deployments')}
        </p>
        <h3 className="mt-1 font-semibold text-lg">{t('ledger.title')}</h3>
      </div>

      {deployments.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('rollout.commit')}</TableHead>
              <TableHead>{t('explorer.table_status')}</TableHead>
              <TableHead>{t('runtime.active_color')}</TableHead>
              <TableHead>{t('rollout.requests')}</TableHead>
              <TableHead>{t('rollout.phase_time')}</TableHead>
              <TableHead>{t('explorer.table_time')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deployments.slice(0, 12).map((deployment, index) => (
              <TableRow
                key={
                  deployment.commitHash ??
                  deployment.deploymentStamp ??
                  `${deployment.startedAt}:${index}`
                }
              >
                <TableCell className="max-w-[260px]">
                  <div className="truncate font-medium">
                    {deployment.commitSubject ?? t('ledger.no_commit_subject')}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {deployment.commitShortHash ??
                      deployment.commitHash ??
                      t('states.none')}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      'rounded-full border',
                      statusTone(deployment.status)
                    )}
                    variant="outline"
                  >
                    {t(getDeploymentStatusTranslationKey(deployment.status))}
                  </Badge>
                </TableCell>
                <TableCell>
                  {deployment.activeColor ?? t('states.none')}
                </TableCell>
                <TableCell>
                  {formatCompactNumber(deployment.requestCount)}
                </TableCell>
                <TableCell>
                  {formatDuration(
                    deployment.buildDurationMs ?? deployment.lifetimeMs
                  )}
                </TableCell>
                <TableCell>
                  {formatDateTime(
                    deployment.finishedAt ??
                      deployment.activatedAt ??
                      deployment.startedAt
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="p-8 text-center text-muted-foreground text-sm">
          {t('empty.ledger')}
        </div>
      )}
    </section>
  );
}
