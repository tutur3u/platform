'use client';

import { WalletRowActions } from './row-actions';
import { Wallet } from '@/types/primitives/Wallet';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import { Translate } from 'next-translate';

export const walletColumns = (
  t: Translate,
  setWallet: (value: Wallet | undefined) => void
): ColumnDef<Wallet>[] => [
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
      <DataTableColumnHeader column={column} title={t('id')} />
    ),
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('name')} />
    ),
    cell: ({ row }) => <div>{row.getValue('name') || '-'}</div>,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('description')} />
    ),
    cell: ({ row }) => <div>{row.getValue('description') || '-'}</div>,
  },
  {
    accessorKey: 'balance',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('balance')} />
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
      <DataTableColumnHeader column={column} title={t('type')} />
    ),
    cell: ({ row }) => <div>{row.getValue('type') || '-'}</div>,
  },
  {
    accessorKey: 'currency',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('currency')} />
    ),
    cell: ({ row }) => <div>{row.getValue('currency') || '-'}</div>,
  },
  {
    accessorKey: 'report_opt_in',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('report_opt_in')} />
    ),
    cell: ({ row }) => (
      <div>{row.getValue('report_opt_in') ? <Check /> : <X />}</div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('created_at')} />
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
    cell: ({ row }) => <WalletRowActions row={row} setWallet={setWallet} />,
  },
];
