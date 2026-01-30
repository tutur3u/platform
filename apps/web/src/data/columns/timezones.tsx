'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Clock, RefreshCw, RefreshCwOff, X } from '@tuturuuu/icons';
import type {
  Timezone,
  TimezoneStatus,
} from '@tuturuuu/types/primitives/Timezone';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { TimezoneRowActions } from '@/components/row-actions/timezones';

export const timezoneColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<Timezone>): ColumnDef<Timezone>[] => [
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
      <div className="wrap-break-word line-clamp-3 max-w-48">
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
      <div className="wrap-break-word line-clamp-1 max-w-16">
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
      <div className="wrap-break-word line-clamp-1 max-w-16">
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
      <div className="wrap-break-word line-clamp-1 max-w-16">
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
        <div className="wrap-break-word line-clamp-1 max-w-16">
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
      <div className="wrap-break-word line-clamp-3 max-w-48">
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
      <div className="wrap-break-word line-clamp-1 flex max-w-32 items-center gap-1">
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
      <div className="wrap-break-word line-clamp-2 max-w-32">
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
