'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, X } from '@tuturuuu/ui/icons';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale } from 'next-intl';
import { TransactionRowActions } from './row-actions';

export const transactionColumns = (
  t: (key: string, values?: Record<string, unknown>) => string,
  namespace: string | undefined
): ColumnDef<Transaction>[] => {
  const locale = useLocale();

  return [
    // {
    //   id: 'select',
    //   header: ({ table }) => (
    //     <Checkbox
    //       checked={table.getIsAllPageRowsSelected()}
    //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    //       aria-label="Select all"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   cell: ({ row }) => (
    //     <Checkbox
    //       checked={row.getIsSelected()}
    //       onCheckedChange={(value) => row.toggleSelected(!!value)}
    //       aria-label="Select row"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   enableSorting: false,
    //   enableHiding: false,
    // },
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
      accessorKey: 'wallet',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.wallet`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32 font-semibold">
          {row.getValue('wallet') || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.description`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32">
          <div className="font-semibold">{row.original.category || '-'}</div>
          {row.original.description && (
            <div className="opacity-70">{row.original.description}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.amount`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32">
          {Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(row.getValue('amount'))}
        </div>
      ),
    },
    {
      accessorKey: 'report_opt_in',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.report_opt_in`)}
        />
      ),
      cell: ({ row }) => (
        <div>{row.getValue('report_opt_in') ? <Check /> : <X />}</div>
      ),
    },
    {
      accessorKey: 'taken_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.taken_at`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32">
          {row.getValue('taken_at')
            ? `${moment(row.getValue('taken_at')).locale(locale).fromNow()}, ${moment(
                row.getValue('taken_at')
              )
                .locale(locale)
                .format('DD/MM/YYYY')}`
            : '-'}
        </div>
      ),
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
          {row.getValue('created_at')
            ? moment(row.getValue('created_at'))
                .locale(locale)
                .format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <TransactionRowActions row={row} href={row.original.href} />
      ),
    },
  ];
};
