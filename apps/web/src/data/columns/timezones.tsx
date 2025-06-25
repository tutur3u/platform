'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type {
  Timezone,
  TimezoneStatus,
} from '@tuturuuu/types/primitives/Timezone';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, Clock, RefreshCw, RefreshCwOff, X } from '@tuturuuu/ui/icons';
import moment from 'moment';
import { TimezoneRowActions } from '@/components/row-actions/timezones';

export const timezoneColumns = (
  t: (key: string) => string,
  namespace: string | undefined
): ColumnDef<Timezone>[] => [
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
    accessorKey: 'value',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.value`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-3 max-w-48 break-words">
        {row.getValue('value')}
      </div>
    ),
  },
  {
    accessorKey: 'abbr',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.abbr`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-16 break-words">
        {row.getValue('abbr') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'offset',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.offset`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-16 break-words">
        {Intl.NumberFormat('en-US', {
          signDisplay: 'exceptZero',
        }).format(row.getValue('offset'))}
      </div>
    ),
  },
  {
    accessorKey: 'isdst',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.isdst`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-16 break-words">
        {row.getValue('isdst') ? <Check /> : <X />}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => {
      const status = row.getValue<TimezoneStatus>('status');

      return (
        <div className="line-clamp-1 max-w-16 break-words">
          {status === 'synced' ? (
            <Check />
          ) : status === 'outdated' ? (
            <RefreshCwOff />
          ) : status === 'pending' ? (
            <RefreshCw />
          ) : status === 'error' ? (
            <X />
          ) : (
            '-'
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'text',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.text`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-3 max-w-48 break-words">
        {row.getValue('text') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'utc',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.utc`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 flex max-w-32 items-center gap-1 break-words">
        <span>
          {((row.getValue('utc') as Array<string>) || [])?.length || '-'}
        </span>
        <Clock className="h-4 w-4" />
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
      <div className="line-clamp-2 max-w-32 break-words">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <TimezoneRowActions row={row} />,
  },
];
