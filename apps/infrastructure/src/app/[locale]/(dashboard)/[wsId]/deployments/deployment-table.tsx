'use client';

import type {
  DeployEnvironmentName,
  DeployLane,
  DeployRecord,
} from '@tuturuuu/internal-api/infrastructure';
import { ExternalLink } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useFormatter, useTranslations } from 'next-intl';
import type { PendingAction } from './deployment-action-dialog';
import {
  actorLabel,
  laneRecords,
  recordActions,
  type StatusTone,
  shortSha,
  statusTone,
} from './deployment-view';

const BADGE: Record<
  StatusTone,
  'success' | 'error' | 'warning' | 'default' | 'secondary'
> = {
  success: 'success',
  danger: 'error',
  warning: 'warning',
  active: 'default',
  muted: 'secondary',
};

export function DeploymentStatusBadge({ record }: { record: DeployRecord }) {
  const t = useTranslations('deployments');
  return (
    <Badge variant={BADGE[statusTone(record.status)]}>
      {t(`statuses.${record.status}`)}
    </Badge>
  );
}

export function DeploymentTable({
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
  const format = useFormatter();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.status')}</TableHead>
          <TableHead>{t('columns.commit')}</TableHead>
          <TableHead>{t('columns.actor')}</TableHead>
          <TableHead>{t('columns.created')}</TableHead>
          <TableHead className="text-right">{t('columns.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {laneRecords(lane).map((record) => {
          const actions = recordActions(environment, lane, record, canOperate);
          return (
            <TableRow key={record.id}>
              <TableCell className="space-x-2 whitespace-nowrap">
                <DeploymentStatusBadge record={record} />
                {record.kind !== 'deploy' && (
                  <Badge variant="outline">{t(`kinds.${record.kind}`)}</Badge>
                )}
                {lane.current?.id === record.id && (
                  <Badge variant="outline">{t('current')}</Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm">
                <span className="inline-flex items-center gap-2">
                  {shortSha(record.sha)}
                  {record.logsUrl && (
                    <a
                      href={record.logsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t('open_run')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {record.url && (
                    <a
                      href={record.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t('open_deployment')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
                {record.failureReason && (
                  <span className="block text-muted-foreground text-xs">
                    {record.failureReason}
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-48 truncate text-sm">
                {actorLabel(record.actor) ?? '—'}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                {format.dateTime(new Date(record.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  {actions.map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={
                        action === 'rollback' || action === 'cancel'
                          ? 'outline'
                          : 'secondary'
                      }
                      onClick={() => onAction({ environment, action, record })}
                    >
                      {t(`actions.${action}`)}
                    </Button>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
