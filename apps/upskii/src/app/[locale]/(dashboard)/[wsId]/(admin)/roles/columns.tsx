'use client';

import { RoleRowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { WorkspaceRole } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { UserCircle } from '@tuturuuu/ui/icons';
import moment from 'moment';

export const roleColumns = (
  t: any,
  namespace: string | undefined,
  _?: any[],
  extraData?: {
    permissionsCount: number;
    user: SupabaseUser;
  }
): ColumnDef<WorkspaceRole>[] => [
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
      <div className="line-clamp-1 max-w-[8rem] break-all">
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
      <div className="line-clamp-1 max-w-[8rem] break-all">
        {row.getValue('name') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'permissions',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.permissions`)}
      />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-1 font-semibold">
        <span className="flex items-center gap-1 rounded border px-1 text-sm font-bold">
          <span className="text-dynamic-orange">
            {(row.getValue('permissions') as any[]).filter((x) => x.enabled)
              .length ?? '-'}
          </span>
          <span className="opacity-50">/</span>
          <span className="text-dynamic-blue">
            {extraData?.permissionsCount}
          </span>
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'user_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.user_count`)}
      />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-1 font-semibold">
        <UserCircle className="h-5 w-5" />
        {row.getValue('user_count') ?? '-'}
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
      <div className="break-all">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) =>
      extraData?.user && <RoleRowActions row={row} user={extraData.user} />,
  },
];
