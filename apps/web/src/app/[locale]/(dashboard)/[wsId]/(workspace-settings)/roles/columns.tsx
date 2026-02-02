'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { UserCircle } from '@tuturuuu/icons';
import type { WorkspaceRole } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { ExpandableRoleRow } from './_components/expandable-role-row';
import { RoleRowActions } from './row-actions';

export const roleColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<WorkspaceRole & { ws_id?: string }> & {
  extraData?: number;
}): ColumnDef<WorkspaceRole & { ws_id?: string }>[] => [
  {
    id: 'expand',
    header: () => <div className="w-6" />,
    cell: ({ row }) => {
      const role = row.original;
      return (
        <ExpandableRoleRow
          role={{ ...role, ws_id: role.ws_id || '' }}
          permissionsCount={extraData || 0}
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
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
        <span className="flex items-center gap-1 rounded border px-1 font-bold text-sm">
          <span className="text-dynamic-orange">
            {(row.getValue('permissions') as any[]).filter((x) => x.enabled)
              .length ?? '-'}
          </span>
          <span className="opacity-50">/</span>
          <span className="text-dynamic-blue">{extraData}</span>
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
    cell: ({ row }) => <RoleRowActions row={row} />,
  },
];
