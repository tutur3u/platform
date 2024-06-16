'use client';

import { UserFieldRowActions } from './row-actions';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { DataTableColumnHeader } from '@repo/ui/components/ui/custom/tables/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import { Translate } from 'next-translate';

export const userFieldColumns = (
  t: Translate
): ColumnDef<WorkspaceUserField>[] => [
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
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('description')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('description') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('type')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('type')
          ? t(
              `ws-user-fields:${(row.getValue('type') as string).toLowerCase()}`
            )
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'possible_values',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('possible_values')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[12rem] break-all">
        {(row.getValue('possible_values') as string[] | null)?.length ? (
          <div className="flex flex-wrap gap-1">
            {(row.getValue('possible_values') as string[]).map((value) => (
              <div
                key={value}
                className="border-foreground/10 bg-foreground/5 line-clamp-1 max-w-[8rem] break-all rounded-lg border p-1"
              >
                {value}
              </div>
            ))}
          </div>
        ) : (
          '-'
        )}
      </div>
    ),
  },
  {
    accessorKey: 'default_value',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('default_value')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('default_value') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'notes',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('notes')} />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('notes') || '-'}
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
    cell: ({ row }) => <UserFieldRowActions row={row} />,
  },
];
