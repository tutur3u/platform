'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { ProjectRowActions } from './row-action';

export const projectColumns = (
  t: (key: string) => string,
  namespace: string | undefined
): ColumnDef<TaskBoard>[] => [
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
      <div className="space-y-1">
        <Link
          href={`/${row.original.ws_id}/tasks/boards/${row.getValue('id')}`}
          className="line-clamp-1 max-w-32 font-semibold break-all hover:underline"
        >
          {row.getValue('name') || '-'}
        </Link>
        {row.original.tags && row.original.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="px-1.5 py-0.5 text-xs"
              >
                {tag}
              </Badge>
            ))}
            {row.original.tags.length > 3 && (
              <Badge
                variant="outline"
                className="px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                +{row.original.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
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
      <div>
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ProjectRowActions row={row} />,
  },
];
