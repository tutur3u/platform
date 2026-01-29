'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownCircle, ArrowUpCircle } from '@tuturuuu/icons';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { TransactionCategoryRowActions } from '@tuturuuu/ui/finance/transactions/categories/row-actions';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import moment from 'moment';

export const transactionCategoryColumns = (
  t: any,
  namespace: string | undefined,
  _extraColumns?: any[],
  extraData?: { currency?: string }
): ColumnDef<TransactionCategoryWithStats>[] => {
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
      cell: ({ row }) => {
        const { icon, color, is_expense } = row.original;

        // Get custom icon if available
        const CustomIcon = icon
          ? getIconComponentByKey(icon as PlatformIconKey)
          : null;

        // Determine the icon to display
        const IconComponent = CustomIcon
          ? CustomIcon
          : is_expense
            ? ArrowDownCircle
            : ArrowUpCircle;

        // Get color styles if a custom color is set
        const colorStyles = color ? computeAccessibleLabelStyles(color) : null;

        // Default colors based on expense type
        const defaultIconClass = is_expense
          ? 'text-dynamic-red'
          : 'text-dynamic-green';

        return (
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={
                colorStyles
                  ? {
                      backgroundColor: colorStyles.bg,
                      borderColor: colorStyles.border,
                      borderWidth: '1px',
                    }
                  : undefined
              }
            >
              <IconComponent
                className="h-4 w-4"
                style={colorStyles ? { color: colorStyles.text } : undefined}
                {...(!colorStyles && {
                  className: `h-4 w-4 ${defaultIconClass}`,
                })}
              />
            </div>
            <span className="font-medium">{row.getValue('name') || '-'}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'transaction_count',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.transaction_count`)}
        />
      ),
      cell: ({ row }) => {
        const count = Number(row.getValue('transaction_count')) || 0;
        return (
          <div className="text-muted-foreground tabular-nums">
            {count.toLocaleString()}
          </div>
        );
      },
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
            className={`font-semibold tabular-nums ${
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
