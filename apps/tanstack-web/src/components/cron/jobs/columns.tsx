'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle, PowerOff } from '@tuturuuu/icons';
import type { WorkspaceCronJobSummary } from '@tuturuuu/internal-api';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';

type CronJobsColumnExtraData = {
  locale: string;
};

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function CronJobStatus({
  active,
  t,
}: {
  active: boolean;
  t: (key: string) => string;
}) {
  if (active) {
    return (
      <div className="flex min-w-28 items-center gap-1 font-semibold text-dynamic-green">
        <CheckCircle className="h-5 w-5" />
        <span>{t('cron-job-data-table.active')}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-28 items-center gap-1 font-semibold text-dynamic-red">
      <PowerOff className="h-5 w-5" />
      <span>{t('cron-job-data-table.inactive')}</span>
    </div>
  );
}

export function getCronJobsColumns({
  extraData,
  namespace,
  t,
}: ColumnGeneratorOptions<WorkspaceCronJobSummary>): ColumnDef<WorkspaceCronJobSummary>[] {
  const { locale } = extraData as CronJobsColumnExtraData;

  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-40 font-mono text-muted-foreground text-xs">
          {row.getValue('id')}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.name`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-40 font-semibold">
          {row.getValue<string | null>('name') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'schedule',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.schedule`)}
        />
      ),
      cell: ({ row }) => (
        <code className="min-w-32 rounded bg-muted px-2 py-1 font-mono text-sm">
          {row.getValue<string | null>('schedule') || '-'}
        </code>
      ),
    },
    {
      accessorKey: 'active',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.status`)}
        />
      ),
      cell: ({ row }) => (
        <CronJobStatus active={row.getValue<boolean>('active')} t={t} />
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.created_at`)}
        />
      ),
      cell: ({ row }) => (
        <time className="min-w-36 whitespace-nowrap">
          {formatDateTime(row.getValue('created_at'), locale)}
        </time>
      ),
    },
  ];
}
