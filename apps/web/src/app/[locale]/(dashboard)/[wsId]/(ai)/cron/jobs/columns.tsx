'use client';

import { RowActions } from './row-actions';
import type { WorkspaceCronJob } from '@/types/db';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import parser from 'cron-parser';
import cronstrue from 'cronstrue';
import { CheckCircle, Clock, PowerOff, XCircle } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';

function getNextRunTime(schedule: string, lastRun?: string | null): string {
  try {
    const interval = parser.parseExpression(schedule);

    // If there's a last run, get next occurrence after that
    if (lastRun) {
      const lastRunDate = new Date(lastRun);
      while (interval.next().getTime() <= lastRunDate.getTime()) {
        // Keep moving forward until we find the next occurrence after last run
        continue;
      }
      return interval.prev().toISOString();
    }

    // If no last run, just get next occurrence from now
    return interval.next().toISOString();
    // eslint-disable-next-line no-unused-vars
  } catch (err) {
    return '-';
  }
}

function renderStatus(
  t: any,
  jobStatus: 'inactive' | 'active' | 'running' | 'failed'
) {
  const status = jobStatus;

  switch (status) {
    case 'active':
      return (
        <div className="text-dynamic-green flex items-center gap-1">
          <CheckCircle className="h-5 w-5" />
          <span>{t('cron-job-data-table.active')}</span>
        </div>
      );

    case 'inactive':
      return (
        <div className="text-dynamic-red flex items-center gap-1">
          <PowerOff className="h-5 w-5" />
          <span>{t('cron-job-data-table.inactive')}</span>
        </div>
      );

    case 'running':
      return (
        <div className="text-dynamic-blue flex items-center gap-1">
          <Clock className="h-5 w-5" />
          <span>{t('cron-job-data-table.running')}</span>
        </div>
      );

    case 'failed':
      return (
        <div className="text-dynamic-red flex items-center gap-1">
          <XCircle className="h-5 w-5" />
          <span>{t('cron-job-data-table.failed')}</span>
        </div>
      );

    default:
      return null;
  }
}

export const getColumns = (
  t: any,
  namespace: string | undefined,
  _?: any,
  extraData?: any
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
      <div className="line-clamp-1 min-w-[8rem]">{row.getValue('id')}</div>
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
      <Link href={row.original.href || '#'} className="min-w-[8rem]">
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
        <div className="flex min-w-[8rem] flex-col">
          <span>{schedule || '-'}</span>
          {schedule && (
            <span className="text-muted-foreground text-xs">
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
      <div className="min-w-[8rem]">
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
        <div className="min-w-[8rem]">
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
        <div className="min-w-[8rem] font-semibold">
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
      <div className="min-w-[8rem]">
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
