'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { PendingInvoice } from '@tuturuuu/types/primitives/PendingInvoice';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Button } from '@tuturuuu/ui/button';
import { FileText } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import moment from 'moment';

export const pendingInvoiceColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<PendingInvoice>[] => [
  {
    accessorKey: 'user_id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.user_id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32">{row.getValue('user_id')}</div>
    ),
  },
  {
    accessorKey: 'user_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.customer`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('user_name') || '-'}</div>
    ),
  },
  {
    accessorKey: 'group_id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.group_id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-32">{row.getValue('group_id')}</div>
    ),
  },
  {
    accessorKey: 'group_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.group`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('group_name') || '-'}</div>
    ),
  },
  {
    accessorKey: 'months_owed',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.months_owed`)}
      />
    ),
    cell: ({ row }) => {
      const monthsValue = row.getValue<string>('months_owed');
      if (!monthsValue) return <div className="min-w-48">-</div>;

      // Parse the comma-separated months and format as range
      const months = monthsValue.split(',').map((m) => m.trim());
      const startMonth = moment(months[0] + '-01').format('MMM YYYY');
      const endMonth = moment(months[months.length - 1] + '-01').format(
        'MMM YYYY'
      );
      const formattedRange = `${startMonth} → ${endMonth}`;

      return (
        <div className="min-w-48">
          <span className="inline-flex items-center rounded-md bg-dynamic-blue/10 px-2.5 py-1 text-xs font-medium text-dynamic-blue">
            {formattedRange}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'attendance_days',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.attendance_days`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24 text-center">
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
          {row.getValue<number>('attendance_days')}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'total_sessions',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.total_sessions`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24 text-center">
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {row.getValue<number>('total_sessions')}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'potential_total',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.potential_total`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32 font-semibold">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(row.getValue<number>('potential_total') || 0)}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.actions`)}
      />
    ),
    cell: ({ row }) => {
      const wsId = row.original.ws_id;
      const userId = row.getValue<string>('user_id');
      const groupId = row.getValue<string>('group_id');
      const monthsOwed = row.getValue<string>('months_owed');
      const attendanceDays = row.getValue<number>('attendance_days');

      // Parse the months and get the LAST (most recent) unpaid month
      const months =
        monthsOwed
          ?.split(',')
          .map((m) => m.trim())
          .filter(Boolean) || [];
      const lastUnpaidMonth = months[months.length - 1] || '';

      if (!wsId) return null;

      // Build the URL with query params
      // Include amount (total attendance_days across all unpaid months) for prefilling
      const createInvoiceUrl = `/${wsId}/finance/invoices/new?type=subscription&user_id=${userId}&group_id=${groupId}&month=${lastUnpaidMonth}&amount=${attendanceDays}`;

      return (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={createInvoiceUrl}>
              <FileText className="mr-2 h-4 w-4" />
              {t(`${namespace}.create_invoice`)}
            </Link>
          </Button>
        </div>
      );
    },
  },
];
