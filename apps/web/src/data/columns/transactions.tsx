'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '../../app/(dashboard)/[wsId]/users/list/data-table-column-header';
import moment from 'moment';
import { Check, X } from 'lucide-react';
import { Transaction } from '@/types/primitives/Transaction';

export const transactionColumns: ColumnDef<Transaction>[] = [
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
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ row }) => <div>{row.getValue('category') || '-'}</div>,
  },
  {
    accessorKey: 'wallet',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Wallet" />
    ),
    cell: ({ row }) => <div>{row.getValue('wallet') || '-'}</div>,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Amount" />
    ),
    cell: ({ row }) => (
      <div>
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(row.getValue('amount'))}
      </div>
    ),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
    cell: ({ row }) => <div>{row.getValue('description') || '-'}</div>,
  },
  {
    accessorKey: 'taken_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Taken at" />
    ),
    cell: ({ row }) => (
      <div>
        {row.getValue('taken_at')
          ? moment(row.getValue('taken_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'report_opt_in',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Show in Reports" />
    ),
    cell: ({ row }) => (
      <div>{row.getValue('report_opt_in') ? <Check /> : <X />}</div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created at" />
    ),
    cell: ({ row }) => (
      <div>
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
