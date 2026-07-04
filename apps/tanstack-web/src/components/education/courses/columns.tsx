'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceCourse } from '@tuturuuu/types';
import { WorkspaceCourseRowActions } from '@tuturuuu/ui/custom/education/courses/course-row-actions';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';

export const getWorkspaceCourseColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<WorkspaceCourse>): ColumnDef<WorkspaceCourse>[] => [
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
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
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
      <Link
        href={row.original.href || '#'}
        className="min-w-32 font-semibold hover:underline"
      >
        {row.getValue('name') || '-'}
      </Link>
    ),
  },
  {
    accessorKey: 'modules',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.modules`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('modules') || '-'}</div>,
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
    cell: ({ row }) => <WorkspaceCourseRowActions row={row} />,
  },
];
