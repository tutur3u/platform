'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceQuizSet } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { QuizSetRowActions } from './row-actions';

export const getQuizSetColumns = (
  t: (key: string) => string,
  namespace: string | undefined,
  _: unknown,
  extraData?: Record<string, unknown>
): ColumnDef<WorkspaceQuizSet>[] => [
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
    accessorKey: 'linked_modules',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.linked_modules`)}
      />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-32 flex-wrap gap-1 font-semibold">
        {(
          row.getValue('linked_modules') as unknown as
            | {
                module_name: string;
                course_name: string;
              }[]
            | undefined
        )?.length
          ? (
              row.getValue('linked_modules') as unknown as {
                module_id: string;
                course_id: string;
                module_name: string;
                course_name: string;
              }[]
            ).map((module) => (
              <Link
                href={`/${extraData.wsId}/education/courses/${module.course_id}/modules/${module.module_id}`}
                key={`${module.course_name}-${module.module_name}`}
                className="w-fit rounded border bg-foreground/5 px-2 py-0.5 hover:underline"
              >
                {module.course_name} / {module.module_name}
              </Link>
            ))
          : '-'}
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
    cell: ({ row }) => (
      <QuizSetRowActions
        row={row}
        wsId={extraData.wsId}
        moduleId={extraData.moduleId}
      />
    ),
  },
];
