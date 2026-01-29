'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownCircle, ArrowUpCircle } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { TransactionCategoryRowActions } from '@tuturuuu/ui/finance/transactions/categories/row-actions';
import moment from 'moment';

export const transactionCategoryColumns = (
  t: any,
  namespace: string | undefined,
  _extraColumns?: any[],
  extraData?: { currency?: string }
): ColumnDef<TransactionCategory>[] => {
  const currency = extraData?.currency || 'USD';

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
        <div className="line-clamp-1">{row.getValue('id')}</div>
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
        <div className="flex items-center gap-2">
          {row.original.is_expense ? (
            <ArrowDownCircle className="h-5 w-5 text-dynamic-red" />
          ) : (
            <ArrowUpCircle className="h-5 w-5 text-dynamic-green" />
          )}
          <span className="font-medium">{row.getValue('name') || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.total_amount`)}
        />
      ),
      cell: ({ row }) => {
        const amount = Number(row.getValue('amount')) || 0;
        const isExpense = row.original.is_expense;

        return (
          <div
            className={`font-semibold ${
              isExpense ? 'text-dynamic-red' : 'text-dynamic-green'
            }`}
          >
            {new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
              style: 'currency',
              currency,
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(Math.abs(amount))}
          </div>
        );
      },
    },
    {
      accessorKey: 'is_expense',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.type`)}
        />
      ),
      cell: ({ row }) => (
        <div>
          {row.getValue('is_expense') ? (
            <div className="w-fit rounded border border-dynamic-red/20 bg-dynamic-red/10 px-1 font-semibold text-dynamic-red">
              {t(`${namespace}.expense`)}
            </div>
          ) : (
            <div className="w-fit rounded border border-dynamic-green/20 bg-dynamic-green/10 px-1 font-semibold text-dynamic-green">
              {t(`${namespace}.income`)}
            </div>
          )}
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
        <div>
          {row.getValue('created_at')
            ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <TransactionCategoryRowActions row={row} />,
    },
  ];
};
