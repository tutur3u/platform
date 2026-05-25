'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { InvoiceRowActions } from '@tuturuuu/ui/finance/invoices/row-actions';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { formatCurrency } from '@tuturuuu/utils/format';
import { getAvatarPlaceholder, getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import type { ReactNode } from 'react';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

type DeleteInvoiceAction = (
  wsId: string,
  invoiceId: string
) => Promise<{ success: boolean; message?: string }>;

interface InvoiceExtraData {
  canDeleteInvoices?: boolean;
  deleteInvoiceAction?: DeleteInvoiceAction;
  currency?: string;
}

function InvoiceAmountText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  return (
    <span className={className}>
      {areNumbersHidden ? FINANCE_HIDDEN_AMOUNT : children}
    </span>
  );
}

function InvoiceFinalPriceCell({
  price,
  totalDiff,
  currency,
}: {
  price: number;
  totalDiff: number;
  currency: string;
}) {
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  if (areNumbersHidden) {
    return (
      <div className="min-w-32 font-semibold text-muted-foreground">
        {FINANCE_HIDDEN_AMOUNT}
      </div>
    );
  }

  return (
    <div className="min-w-32">
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger className="font-semibold">
            {formatCurrency(price + totalDiff, currency)}
          </TooltipTrigger>
          <TooltipContent className="text-center font-semibold">
            <div>
              <span className="text-blue-600 dark:text-blue-300">
                {formatCurrency(price, currency, undefined, {
                  signDisplay: 'never',
                })}
              </span>{' '}
              {totalDiff < 0 ? '-' : '+'}{' '}
              <span
                className={
                  totalDiff < 0
                    ? 'text-red-600 dark:text-red-300'
                    : 'text-green-600 dark:text-green-300'
                }
              >
                {formatCurrency(totalDiff, currency, undefined, {
                  signDisplay: 'never',
                })}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export const invoiceColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<Invoice> & {
  extraData?: InvoiceExtraData;
}): ColumnDef<Invoice>[] => {
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
      cell: ({ row }) => {
        const customer = row.original.customer;
        if (!customer) return <div className="min-w-32">-</div>;

        const displayName =
          customer.display_name || customer.full_name || 'Unknown';

        return (
          <div className="flex min-w-32 items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={customer.avatar_url || getAvatarPlaceholder(displayName)}
                alt={displayName}
              />
              <AvatarFallback className="text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <span className="whitespace-nowrap">{displayName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'creator',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.creator`)}
        />
      ),
      cell: ({ row }) => {
        const creator = row.original.creator;
        if (!creator) return <div className="min-w-32">-</div>;

        const displayName =
          creator.display_name ||
          creator.full_name ||
          creator.email ||
          'Unknown';

        return (
          <div className="flex min-w-32 items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={creator.avatar_url || getAvatarPlaceholder(displayName)}
                alt={displayName}
              />
              <AvatarFallback className="text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <span className="whitespace-nowrap">{displayName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'wallet',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.wallet`)}
        />
      ),
      cell: ({ row }) => {
        const wallet = row.original.wallet;
        if (!wallet?.name) return <div className="min-w-32">-</div>;

        return (
          <div className="min-w-32">
            <span className="line-clamp-1">{wallet.name}</span>
          </div>
        );
      },
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
          <InvoiceAmountText>
            {formatCurrency(row.getValue<number>('price') || 0, currency)}
          </InvoiceAmountText>
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
          <InvoiceAmountText>
            {row.getValue('total_diff') === 0
              ? '-'
              : formatCurrency(
                  row.getValue('total_diff'),
                  currency,
                  undefined,
                  {
                    signDisplay: 'always',
                  }
                )}
          </InvoiceAmountText>
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
        <InvoiceFinalPriceCell
          price={row.getValue<number>('price') || 0}
          totalDiff={row.getValue<number>('total_diff') || 0}
          currency={currency}
        />
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
      cell: ({ row }) => (
        <InvoiceRowActions
          row={row}
          href={row.original.href}
          canDeleteInvoices={extraData?.canDeleteInvoices}
          deleteInvoiceAction={extraData?.deleteInvoiceAction}
        />
      ),
    },
  ];
};
