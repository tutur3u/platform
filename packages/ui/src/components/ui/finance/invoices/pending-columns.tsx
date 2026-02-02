'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { FileText } from '@tuturuuu/icons';
import type { PendingInvoice } from '@tuturuuu/types/primitives/PendingInvoice';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { formatCurrency } from '@tuturuuu/utils/format';
import { getAvatarPlaceholder, getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import Link from 'next/link';

type PendingInvoiceRow = PendingInvoice & {
  group_ids?: string[];
  group_names?: string[];
};

export const pendingInvoiceColumns = (
  t: any,
  namespace: string | undefined,
  useAttendanceBased = true,
  currency: string = 'USD'
): ColumnDef<PendingInvoice>[] => {
  const currencyLocale = currency === 'VND' ? 'vi-VN' : 'en-US';

  return [
    {
      accessorKey: 'user_id',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.user_id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 min-w-32">{row.getValue('user_id')}</div>
      ),
    },
    {
      accessorKey: 'user_name',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.customer`)}
        />
      ),
      cell: ({ row }) => {
        const name = row.getValue<string>('user_name') || 'Unknown';
        const avatarUrl = row.original.user_avatar_url;

        return (
          <div className="flex min-w-32 items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={avatarUrl || getAvatarPlaceholder(name)}
                alt={name}
              />
              <AvatarFallback className="text-xs">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <span className="line-clamp-1">{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'group_id',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.group_id`)}
        />
      ),
      cell: ({ row }) => {
        const groupId = row.getValue<string>('group_id');
        const groupIds = (
          (row.original as PendingInvoiceRow).group_ids ?? []
        ).filter((id: string) => Boolean(id));
        const displayValue =
          groupIds.length > 0 ? groupIds.join(', ') : groupId || '-';
        return <div className="line-clamp-1 min-w-32">{displayValue}</div>;
      },
    },
    {
      accessorKey: 'group_name',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.group`)}
        />
      ),
      cell: ({ row }) => {
        const groupName = row.getValue<string>('group_name');
        const groupNames = (
          (row.original as PendingInvoiceRow).group_names ?? []
        ).filter((name: string) => Boolean(name));

        if (groupNames.length > 1) {
          return (
            <div className="min-w-32">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-dynamic-blue hover:text-dynamic-blue/80"
                  >
                    {groupNames.length} {t('common.groups')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <div className="grid gap-2">
                    <h4 className="font-medium leading-none">
                      {t('common.groups')}
                    </h4>
                    <ul className="text-muted-foreground text-sm">
                      {groupNames.map((name, index) => (
                        <li key={`${name}-${index}`} className="line-clamp-1">
                          • {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          );
        }

        if (groupNames.length === 1) {
          return <div className="line-clamp-1 min-w-32">{groupNames[0]}</div>;
        }

        return <div className="line-clamp-1 min-w-32">{groupName || '-'}</div>;
      },
    },
    {
      accessorKey: 'months_owed',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.months_owed`)}
        />
      ),
      cell: ({ row }) => {
        const monthsValue = row.getValue<string[]>('months_owed');
        if (!monthsValue || monthsValue.length === 0)
          return <div className="min-w-48">-</div>;

        // Format months array as range or single month
        const formattedMonths =
          monthsValue.length === 1
            ? moment(`${monthsValue[0]}-01`).format('MMM YYYY')
            : (() => {
                const startMonth = moment(`${monthsValue[0]}-01`).format(
                  'MMM YYYY'
                );
                const endMonth = moment(
                  `${monthsValue[monthsValue.length - 1]}-01`
                ).format('MMM YYYY');
                return `${startMonth} → ${endMonth}`;
              })();

        return (
          <div className="min-w-48">
            <span className="inline-flex items-center rounded-md bg-dynamic-blue/10 px-2.5 py-1 font-medium text-dynamic-blue text-xs">
              {formattedMonths}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'attendance_days',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.attendance_days`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-24 text-center">
          <span className="inline-flex items-center rounded-full bg-dynamic-green/10 px-2.5 py-0.5 font-medium text-dynamic-green text-xs">
            {row.getValue<number>('attendance_days')}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'total_sessions',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.total_sessions`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-24 text-center">
          <span className="inline-flex items-center rounded-full bg-dynamic-blue/10 px-2.5 py-0.5 font-medium text-dynamic-blue text-xs">
            {row.getValue<number>('total_sessions')}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'potential_total',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.potential_total`)}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-32 font-semibold">
          {formatCurrency(
            row.getValue<number>('potential_total') || 0,
            currencyLocale,
            currency
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`${namespace}.actions`)}
        />
      ),
      cell: ({ row }) => {
        const wsId = row.original.ws_id;
        const userId = row.getValue<string>('user_id');
        const groupId = row.getValue<string>('group_id');
        const groupIds = (
          (row.original as PendingInvoiceRow).group_ids ??
          (groupId ? [groupId] : [])
        ).filter((id: string) => Boolean(id));
        const monthsOwed = row.getValue<string[]>('months_owed');
        const attendanceDays = row.getValue<number>('attendance_days');

        // Get the LAST (most recent) unpaid month from the array
        const lastUnpaidMonth =
          monthsOwed && monthsOwed.length > 0
            ? monthsOwed[monthsOwed.length - 1]
            : '';

        if (!wsId) return null;

        const searchParams = new URLSearchParams();
        searchParams.set('type', 'subscription');
        searchParams.set('user_id', userId);
        if (lastUnpaidMonth) {
          searchParams.set('month', lastUnpaidMonth);
        }
        if (useAttendanceBased) {
          searchParams.set('amount', String(attendanceDays));
        }
        if (groupIds.length > 0) {
          searchParams.set('group_ids', groupIds.join(','));
        }

        const createInvoiceUrl = `/${wsId}/finance/invoices/new?${searchParams.toString()}`;

        return (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={createInvoiceUrl}>
                <FileText className="mr-2 h-4 w-4" />
                {t(`${namespace}.create_invoice`)}
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];
};
