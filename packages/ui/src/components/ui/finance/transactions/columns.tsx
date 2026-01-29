'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { TransactionRowActions } from '@tuturuuu/ui/finance/transactions/row-actions';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale } from 'next-intl';
import { DataTableColumnHeader } from '../../custom/tables/data-table-column-header';

function getAvatarPlaceholder(name: string) {
  return `https://ui-avatars.com/api/?name=${name}`;
}

export const transactionColumns = (
  t: any,
  namespace: string | undefined,
  _extraColumns?: any[],
  extraData?: { currency?: string; isPersonalWorkspace?: boolean }
): ColumnDef<Transaction>[] => {
  const locale = useLocale();
  const currency = extraData?.currency || 'USD';
  const isPersonalWorkspace = extraData?.isPersonalWorkspace || false;

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
      cell: ({ row }) => (
        <div className="min-w-32">
          <div className="font-semibold">{row.original.category || '-'}</div>
          {row.original.description && (
            <div className="opacity-70">{row.original.description}</div>
          )}
        </div>
      ),
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
                  src={getAvatarPlaceholder('Unknown User')}
                  alt="Unknown User"
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
        const isExpense = amount < 0;

        return (
          <div
            className={`min-w-32 font-semibold ${
              isExpense ? 'text-dynamic-red' : 'text-dynamic-green'
            }`}
          >
            {Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
              style: 'currency',
              currency,
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
              signDisplay: 'always',
            }).format(amount)}
          </div>
        );
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
