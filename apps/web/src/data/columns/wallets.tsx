'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '../../app/(dashboard)/[wsId]/users/list/data-table-column-header';
import moment from 'moment';
import { Wallet } from '@/types/primitives/Wallet';
import { Check, X } from 'lucide-react';

export const walletColumns: ColumnDef<Wallet>[] = [
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
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => <div>{row.getValue('name') || '-'}</div>,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
    cell: ({ row }) => <div>{row.getValue('description') || '-'}</div>,
  },
  {
    accessorKey: 'balance',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Balance" />
    ),
    cell: ({ row }) => (
      <div>
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(row.getValue('balance'))}
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => <div>{row.getValue('type') || '-'}</div>,
  },
  {
    accessorKey: 'currency',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Currency" />
    ),
    cell: ({ row }) => <div>{row.getValue('currency') || '-'}</div>,
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
