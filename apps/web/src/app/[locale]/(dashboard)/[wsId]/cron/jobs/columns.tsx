'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceCronJob } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { CheckCircle, Clock, PowerOff, XCircle } from '@tuturuuu/ui/icons';
import parser from 'cron-parser';
import cronstrue from 'cronstrue';
import moment from 'moment';
import Link from 'next/link';
import { RowActions } from './row-actions';

function getNextRunTime(schedule: string, lastRun?: string | null) {
  try {
    const interval = parser.parse(schedule);

    // If there's a last run, get next occurrence after that
    if (lastRun) {
      const lastRunDate = new Date(lastRun);
      while (interval.next().getTime() <= lastRunDate.getTime()) {}
      return interval.prev().toISOString();
    }

    // If no last run, just get next occurrence from now
    return interval.next().toISOString();
    // eslint-disable-next-line no-unused-vars
  } catch (_err) {
    return '-';
  }
}

function renderStatus(
  t: (key: string) => string,
  jobStatus: 'inactive' | 'active' | 'running' | 'failed'
) {
  const status = jobStatus;

  switch (status) {
    case 'active':
      return (
        <div className="flex items-center gap-1 text-dynamic-green">
          <CheckCircle className="h-5 w-5" />
          <span>{t('cron-job-data-table.active')}</span>
        </div>
      );

    case 'inactive':
      return (
        <div className="flex items-center gap-1 text-dynamic-red">
          <PowerOff className="h-5 w-5" />
          <span>{t('cron-job-data-table.inactive')}</span>
        </div>
      );

    case 'running':
      return (
        <div className="flex items-center gap-1 text-dynamic-blue">
          <Clock className="h-5 w-5" />
          <span>{t('cron-job-data-table.running')}</span>
        </div>
      );

    case 'failed':
      return (
        <div className="flex items-center gap-1 text-dynamic-red">
          <XCircle className="h-5 w-5" />
          <span>{t('cron-job-data-table.failed')}</span>
        </div>
      );

    default:
      return null;
  }
}

export const getColumns = (
  t: (key: string) => string,
  namespace: string | undefined,
  _?: unknown,
  extraData?: Record<string, unknown>
): ColumnDef<WorkspaceCronJob>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.name`)}
      />
    ),
    cell: ({ row }) => (
      <Link href={row.original.href || '#'} className="min-w-32">
        <span className="font-semibold hover:underline">
          {row.getValue('name') || '-'}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: 'schedule',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.schedule`)}
      />
    ),
    cell: ({ row }) => {
      const schedule = row.getValue('schedule') as string;
      return (
        <div className="flex min-w-32 flex-col">
          <span>{schedule || '-'}</span>
          {schedule && (
            <span className="text-xs text-muted-foreground">
              {cronstrue.toString(schedule)}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'last_run',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.last_run`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {row.getValue('last_run')
          ? moment(row.getValue('last_run')).format('DD/MM/YYYY HH:mm')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'next_run',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.next_run`)}
      />
    ),
    cell: ({ row }) => {
      const schedule = row.getValue('schedule') as string;
      const lastRun = row.getValue('last_run') as string;
      const nextRun = row.getValue('next_run') as string;

      // Use stored next_run if available, otherwise calculate it
      const nextRunTime =
        nextRun || (schedule ? getNextRunTime(schedule, lastRun) : '-');

      return (
        <div className="min-w-32">
          {nextRunTime !== '-'
            ? moment(nextRunTime).format('DD/MM/YYYY HH:mm')
            : '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => {
      const status = row.original.active;

      return (
        <div className="min-w-32 font-semibold">
          {renderStatus(t, status ? 'active' : 'inactive')}
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.created_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {moment(row.getValue('created_at')).format('DD/MM/YYYY')}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <RowActions row={row} href={row.original.href} extraData={extraData} />
    ),
  },
];
