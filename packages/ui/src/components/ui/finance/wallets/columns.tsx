'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Check,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
  X,
} from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { WalletRowActions } from '@tuturuuu/ui/finance/wallets/row-actions';
import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';
import { convertCurrency } from '@tuturuuu/utils/exchange-rates';
import { cn, formatCurrency } from '@tuturuuu/utils/format';
import moment from 'moment';
import Link from 'next/link';
import { WalletIconDisplay } from './wallet-icon-display';

interface WalletExtraData {
  canUpdateWallets?: boolean;
  canDeleteWallets?: boolean;
  currency?: string;
  exchangeRates?: ExchangeRate[];
  isPersonalWorkspace?: boolean;
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
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <WalletIconDisplay
            icon={row.original.icon}
            imageSrc={row.original.image_src}
            size="sm"
          />
          <Link
            href={row.original.href || '#'}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold hover:underline"
          >
            {row.getValue('name') || '-'}
          </Link>
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
        const walletCurrency = row.original.currency || workspaceCurrency;

        const formattedBalance = formatCurrency(
          balance,
          walletCurrency,
          undefined,
          { signDisplay: 'auto' }
        );

        // Show converted amount if wallet currency differs from workspace currency
        const exchangeRates = extraData?.exchangeRates;
        let convertedText: string | null = null;
        if (
          walletCurrency !== workspaceCurrency &&
          exchangeRates &&
          exchangeRates.length > 0 &&
          balance !== 0
        ) {
          const converted = convertCurrency(
            balance,
            walletCurrency,
            workspaceCurrency,
            exchangeRates
          );
          if (converted !== null) {
            convertedText = formatCurrency(
              Math.abs(converted),
              workspaceCurrency,
              undefined,
              { signDisplay: 'never', maximumFractionDigits: 0 }
            );
          }
        }

        const isPositive = balance > 0;
        const isNegative = balance < 0;
        const isNeutral = balance === 0;

        return (
          <div className="flex flex-col gap-0.5">
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
            {convertedText && (
              <span className="text-muted-foreground text-xs">
                {'\u2248'} {convertedText}
              </span>
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
      cell: ({ row }) => {
        const type = row.getValue('type') as string;
        if (!type) return <div>-</div>;
        const isCredit = type === 'CREDIT';
        return (
          <Badge
            variant="outline"
            className={cn(
              'flex w-fit items-center gap-1',
              isCredit
                ? 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple'
                : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
            )}
          >
            {isCredit ? (
              <CreditCard className="h-3 w-3" />
            ) : (
              <WalletIcon className="h-3 w-3" />
            )}
            {t(`${namespace}.${type.toLowerCase()}`)}
          </Badge>
        );
      },
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
          isPersonalWorkspace={extraData?.isPersonalWorkspace}
        />
      ),
    },
  ];
};
