'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { TransactionRowActions } from '@tuturuuu/ui/finance/transactions/row-actions';
import { formatCurrency } from '@tuturuuu/utils/format';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale } from 'next-intl';
import { DataTableColumnHeader } from '../../custom/tables/data-table-column-header';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

function getAvatarPlaceholder(name: string) {
  return `https://ui-avatars.com/api/?name=${name}`;
}

interface TransactionExtraData {
  currency?: string;
  isPersonalWorkspace?: boolean;
}

function TransactionAmountCell({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) {
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const isExpense = amount < 0;

  return (
    <div
      className={`min-w-32 font-semibold ${
        areNumbersHidden
          ? 'text-muted-foreground'
          : isExpense
            ? 'text-dynamic-red'
            : 'text-dynamic-green'
      }`}
    >
      {areNumbersHidden
        ? FINANCE_HIDDEN_AMOUNT
        : formatCurrency(amount, currency, undefined, {
            signDisplay: 'always',
          })}
    </div>
  );
}

export const transactionColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<Transaction> & {
  extraData?: TransactionExtraData;
}): ColumnDef<Transaction>[] => {
  const locale = useLocale();
  const currency = extraData?.currency || 'USD';
  const isPersonalWorkspace = extraData?.isPersonalWorkspace || false;
  const unknownUserLabel = t('finance.unknown_user');

  const columns: ColumnDef<Transaction>[] = [
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
      accessorKey: 'wallet',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.wallet`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32 font-semibold">
          {row.getValue('wallet') || '-'}
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
      cell: ({ row }) => {
        const description = row.original.description?.trim();
        const category = row.original.category?.trim();
        const tags = row.original.tags ?? [];

        return (
          <div className="min-w-44 max-w-80 space-y-1">
            <div className="line-clamp-2 font-semibold">
              {description || category || '-'}
            </div>
            {category && description && (
              <div className="line-clamp-1 text-muted-foreground text-xs">
                {category}
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded border px-1.5 py-0.5 text-xs"
                    style={{
                      borderColor: tag.color || undefined,
                      color: tag.color || undefined,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
                {tags.length > 3 && (
                  <span className="rounded border px-1.5 py-0.5 text-muted-foreground text-xs">
                    ...
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'user',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.user`) || 'User'}
        />
      ),
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) {
          return (
            <div className="flex min-w-48 items-center gap-2">
              <Avatar className="h-8 w-8 border">
                <AvatarImage
                  src={getAvatarPlaceholder(unknownUserLabel)}
                  alt={unknownUserLabel}
                />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-semibold">-</span>
                <span className="text-xs opacity-70">-</span>
              </div>
            </div>
          );
        }

        const initials = user.full_name
          ? user.full_name
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase()
          : user.email && user.email.length > 0
            ? user.email[0]?.toUpperCase()
            : 'U';
        return (
          <div className="flex min-w-48 items-center gap-2">
            <Avatar className="h-8 w-8 border">
              <AvatarImage
                src={
                  user.avatar_url ||
                  getAvatarPlaceholder(user.full_name || user.email || 'User')
                }
                alt={user.full_name || user.email || 'User'}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold">{user.full_name || '-'}</span>
              <span className="text-xs opacity-70">{user.email || '-'}</span>
            </div>
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
          title={t(`${namespace}.amount`)}
        />
      ),
      cell: ({ row }) => {
        const amount = Number(row.getValue('amount')) || 0;
        return <TransactionAmountCell amount={amount} currency={currency} />;
      },
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
      accessorKey: 'taken_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.taken_at`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32">
          {row.getValue('taken_at')
            ? `${moment(row.getValue('taken_at')).locale(locale).fromNow()}, ${moment(
                row.getValue('taken_at')
              )
                .locale(locale)
                .format('DD/MM/YYYY')}`
            : '-'}
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
        <div className="min-w-32">
          {row.getValue('created_at')
            ? moment(row.getValue('created_at'))
                .locale(locale)
                .format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <TransactionRowActions row={row} href={row.original.href} />
      ),
    },
  ];

  // Filter out the user column if in personal workspace
  if (isPersonalWorkspace) {
    return columns.filter((col) => {
      const accessorKey = (col as any).accessorKey;
      return accessorKey !== 'user';
    });
  }

  return columns;
};
