'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import GroupAttendanceStats from './attendance-stats';
import { ManagerCell } from './manager-cell';
import { MemberCountCell } from './member-count-cell';
import { UserGroupRowActions } from './row-actions';

export const getUserGroupColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<UserGroup> & {
  extraData?: {
    canDeleteUserGroups?: boolean;
    canUpdateUserGroups?: boolean;
    canCreateUserGroups?: boolean;
    wsId?: string;
  };
}): ColumnDef<UserGroup>[] => [
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
      <div className="flex min-w-32 items-center gap-2">
        <Link
          href={row.original.href || '#'}
          className="font-semibold hover:underline"
        >
          {row.getValue('name') || '-'}
        </Link>
        {row.original.archived && (
          <Badge
            variant="outline"
            className="border-dynamic-orange/30 text-dynamic-orange"
          >
            {t(`${namespace}.archived`)}
          </Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'managers',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.managers`)}
      />
    ),
    cell: ({ row }) => {
      const managers = row.original.managers;
      const linkedCount =
        managers?.filter((manager) => manager.hasLinkedPlatformUser).length ??
        0;
      const total = managers?.length ?? 0;

      return (
        <ManagerCell
          canLink={extraData?.canUpdateUserGroups}
          managers={managers}
          wsId={extraData?.wsId ?? row.original.ws_id}
          labels={{
            linkedAll: t(`${namespace}.managers_linked_all`),
            linkedCount: t(`${namespace}.linked_managers`, {
              linked: linkedCount,
              total,
            }),
            linkedNone: t(`${namespace}.managers_linked_none`),
            linkedSome: t(`${namespace}.managers_linked_some`),
            managers: t(`${namespace}.managers`),
          }}
        />
      );
    },
  },
  {
    accessorKey: 'attendance_stats',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.attendance_stats`)}
      />
    ),
    cell: ({ row }) => (
      <GroupAttendanceStats snapshot={row.original.today_attendance} />
    ),
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.amount`)}
      />
    ),
    cell: ({ row }) => (
      <MemberCountCell
        group={row.original}
        labels={{
          managers: t(`${namespace}.managers`),
          members: t(`${namespace}.members`),
        }}
      />
    ),
  },
  {
    accessorKey: 'locked',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.locked`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('locked') ? <Check /> : <X />}</div>,
  },
  {
    accessorKey: 'is_guest',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.is_guest`)}
      />
    ),
    cell: ({ row }) => (
      <div>{row.getValue('is_guest') ? <Check /> : <X />}</div>
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
      <UserGroupRowActions
        row={row}
        canUpdate={extraData?.canUpdateUserGroups}
        canDelete={extraData?.canDeleteUserGroups}
        canCreate={extraData?.canCreateUserGroups}
      />
    ),
  },
];
