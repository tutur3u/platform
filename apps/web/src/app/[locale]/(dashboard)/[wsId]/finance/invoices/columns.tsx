'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import moment from 'moment';
import { InvoiceRowActions } from './row-actions';

export const invoiceColumns = (
  t: (key: string) => string,
  namespace: string | undefined
): ColumnDef<Invoice>[] => [
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
    accessorKey: 'customer_id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.customer_id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1">{row.getValue('customer_id')}</div>
    ),
  },
  {
    accessorKey: 'customer',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.customer`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('customer') || '-'}</div>
    ),
  },
  {
    accessorKey: 'price',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.price`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(row.getValue<number>('price') || 0)}
      </div>
    ),
  },
  {
    accessorKey: 'total_diff',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.total_diff`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {row.getValue('total_diff') === 0
          ? '-'
          : Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
              signDisplay: 'always',
            }).format(row.getValue('total_diff'))}
      </div>
    ),
  },
  {
    accessorKey: 'final_price',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.final_price`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger className="font-semibold">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(
                (row.getValue<number>('price') || 0) +
                  (row.getValue<number>('total_diff') || 0)
              )}
            </TooltipTrigger>
            <TooltipContent className="text-center font-semibold">
              <div>
                <span className="text-blue-600 dark:text-blue-300">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                    signDisplay: 'never',
                  }).format(row.getValue<number>('price') || 0)}
                </span>{' '}
                {(row.getValue<number>('total_diff') || 0) < 0 ? '-' : '+'}{' '}
                <span
                  className={
                    (row.getValue<number>('total_diff') || 0) < 0
                      ? 'text-red-600 dark:text-red-300'
                      : 'text-green-600 dark:text-green-300'
                  }
                >
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                    signDisplay: 'never',
                  }).format(row.getValue<number>('total_diff') || 0)}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
  },
  {
    accessorKey: 'notice',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.notice`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('notice') || '-'}</div>
    ),
  },
  {
    accessorKey: 'note',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.note`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('note') || '-'}</div>
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
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <InvoiceRowActions row={row} href={row.original.href} />,
  },
];
