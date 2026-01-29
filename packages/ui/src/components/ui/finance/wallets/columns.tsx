'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, TrendingDown, TrendingUp, X } from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { WalletRowActions } from '@tuturuuu/ui/finance/wallets/row-actions';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';

interface WalletExtraData {
  canUpdateWallets?: boolean;
  canDeleteWallets?: boolean;
  currency?: string;
}

export const walletColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<Wallet> & {
  extraData?: WalletExtraData;
}): ColumnDef<Wallet>[] => {
  const workspaceCurrency = extraData?.currency || 'USD';

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
      cell: ({ row }) => {
        const balance = Number(row.getValue('balance')) || 0;
        // Use workspace currency for display consistency
        const currency = workspaceCurrency;
        const locale = currency === 'VND' ? 'vi-VN' : 'en-US';

        const formattedBalance = Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: currency === 'VND' ? 0 : 2,
          signDisplay: 'always',
        }).format(balance);

        const isPositive = balance > 0;
        const isNegative = balance < 0;
        const isNeutral = balance === 0;

        return (
          <div className="flex items-center gap-2">
            {isPositive && (
              <Badge
                variant="outline"
                className={cn(
                  'border-dynamic-green/30 bg-dynamic-green/10 font-semibold text-dynamic-green',
                  'flex items-center gap-1'
                )}
              >
                <TrendingUp className="h-3 w-3" />
                {formattedBalance}
              </Badge>
            )}
            {isNegative && (
              <Badge
                variant="outline"
                className={cn(
                  'border-dynamic-red/30 bg-dynamic-red/10 font-semibold text-dynamic-red',
                  'flex items-center gap-1'
                )}
              >
                <TrendingDown className="h-3 w-3" />
                {formattedBalance}
              </Badge>
            )}
            {isNeutral && (
              <Badge
                variant="outline"
                className="font-semibold text-muted-foreground"
              >
                {formattedBalance}
              </Badge>
            )}
          </div>
        );
      },
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
        <WalletRowActions
          row={row}
          href={row.original.href}
          canUpdateWallets={extraData?.canUpdateWallets}
          canDeleteWallets={extraData?.canDeleteWallets}
        />
      ),
    },
  ];
};
