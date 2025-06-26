'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceCourseModule } from '@tuturuuu/types/db';
import { WorkspaceCourseModuleRowActions } from '@tuturuuu/ui/custom/education/modules/course-module-row-actions';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, X } from '@tuturuuu/ui/icons';
import moment from 'moment';
import Link from 'next/link';

export const getWorkspaceCourseModuleColumns = (
  t: (key: string) => string,
  namespace: string | undefined,
  _: unknown,
  extraData?: Record<string, unknown>
): ColumnDef<WorkspaceCourseModule>[] => [
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
    accessorKey: 'is_public',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.is_public`)}
      />
    ),
    cell: ({ row }) => (
      <div className="font-semibold">
        {row.getValue('is_public') ? <Check /> : <X />}
      </div>
    ),
  },
  {
    accessorKey: 'is_published',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.is_published`)}
      />
    ),
    cell: ({ row }) => (
      <div className="font-semibold">
        {row.getValue('is_published') ? <Check /> : <X />}
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
    cell: ({ row }) => {
      const wsId = typeof extraData?.wsId === 'string' ? extraData.wsId : '';
      const courseId =
        typeof extraData?.courseId === 'string' ? extraData.courseId : '';
      return (
        <WorkspaceCourseModuleRowActions
          row={row}
          wsId={wsId}
          courseId={courseId}
        />
      );
    },
  },
];
