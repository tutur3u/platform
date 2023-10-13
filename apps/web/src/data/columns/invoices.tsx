'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { Invoice } from '@/types/primitives/Invoice';
import { Translate } from 'next-translate';

export const invoiceColumns = (t: Translate): ColumnDef<Invoice>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('id')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 min-w-[8rem]">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'customer_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('customer_id')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1">{row.getValue('customer_id')}</div>
    ),
  },
  {
    accessorKey: 'customer',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('customer')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">{row.getValue('customer') || '-'}</div>
    ),
  },
  {
    accessorKey: 'price',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('price')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(row.getValue('price'))}
      </div>
    ),
  },
  {
    accessorKey: 'total_diff',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('total_diff')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(row.getValue('total_diff'))}
      </div>
    ),
  },
  {
    accessorKey: 'notice',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('notice')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">{row.getValue('notice') || '-'}</div>
    ),
  },
  {
    accessorKey: 'note',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('note')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">{row.getValue('note') || '-'}</div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('created_at')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  //   {
  //     id: 'actions',
  //     cell: ({ row }) => <SecretRowActions row={row} />,
  //   },
];
