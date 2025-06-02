'use client';

import { WalletRowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, X } from '@tuturuuu/ui/icons';
import moment from 'moment';

export const walletColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<Wallet>[] => {
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
      cell: ({ row }) => <div>{row.getValue('name') || '-'}</div>,
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
      cell: ({ row }) => <div>{row.getValue('description') || '-'}</div>,
    },
    {
      accessorKey: 'balance',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.balance`)}
        />
      ),
      cell: ({ row }) => (
        <div>
          {Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'VND',
          }).format(row.getValue('balance'))}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.type`)}
        />
      ),
      cell: ({ row }) => <div>{row.getValue('type') || '-'}</div>,
    },
    {
      accessorKey: 'currency',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.currency`)}
        />
      ),
      cell: ({ row }) => <div>{row.getValue('currency') || '-'}</div>,
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
      cell: ({ row }) => (
        <WalletRowActions row={row} href={row.original.href} />
      ),
    },
  ];
};
