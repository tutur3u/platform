'use client';

import { ApiKeyRowActions } from './row-actions';
import { DataTableColumnHeader } from '@/components/ui/custom/tables/data-table-column-header';
import { WorkspaceApiKey } from '@/types/primitives/WorkspaceApiKey';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { Translate } from 'next-translate';

export const apiKeyColumns = (t: Translate): ColumnDef<WorkspaceApiKey>[] => [
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
      <DataTableColumnHeader column={column} title={t('id')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('id')}
      </div>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('name')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('name') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'value',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('value')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('value') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('created_at')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-2 max-w-[8rem] break-all">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => <ApiKeyRowActions row={row} />,
  },
];
