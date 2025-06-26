'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceApiKey } from '@tuturuuu/types/primitives/WorkspaceApiKey';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { ApiKeyRowActions } from './row-actions';

export const groupTagColumns = (
  t: (key: string, values?: Record<string, unknown>) => string,
  namespace: string | undefined
): ColumnDef<WorkspaceApiKey>[] => [
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
      <div className="line-clamp-1 max-w-32 break-all">
        {row.getValue('id')}
      </div>
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
      <div className="line-clamp-1 max-w-32 break-all">
        <ColorPicker
          text={row.getValue('name')}
          value={row.getValue('color') || '#000000'}
          className="line-clamp-1 w-full cursor-default"
        />
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
      <div className="line-clamp-2 max-w-32 break-all">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ApiKeyRowActions row={row} />,
  },
];
