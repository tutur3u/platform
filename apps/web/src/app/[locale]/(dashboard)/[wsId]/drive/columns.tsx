'use client';

import { StorageObjectRowActions } from './row-actions';
import { StorageObject } from '@/types/primitives/StorageObject';
import { formatBytes } from '@/utils/file-helper';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { Translate } from 'next-translate';

export const storageObjectsColumns = (
  t: Translate,
  setStorageObject: (value: StorageObject | undefined) => void,
  wsId: string
): ColumnDef<StorageObject>[] => [
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
      <div className="line-clamp-1 min-w-[8rem]">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('name')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem] font-semibold">
        {row.getValue('name')
          ? (row.getValue('name') as string).split(`${wsId}/`)[1]
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'size',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('size')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {row.original?.metadata?.size !== undefined
          ? formatBytes(row.original.metadata.size)
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('created_at')} />
    ),
    cell: ({ row }) => (
      <div className="min-w-[8rem]">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <StorageObjectRowActions
        wsId={wsId}
        row={row}
        setStorageObject={setStorageObject}
      />
    ),
  },
];
