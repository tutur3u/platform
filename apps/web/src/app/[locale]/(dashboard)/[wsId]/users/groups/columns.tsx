'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Users, X } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import moment from 'moment';
import Link from 'next/link';
import GroupAttendanceStats from './attendance-stats';
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
  };
}): ColumnDef<UserGroup>[] => [
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
      if (!managers || managers.length === 0) return <div>-</div>;
      if (managers.length === 1) {
        const m = managers[0];
        if (!m) return null;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={m.avatar_url || undefined} />
              <AvatarFallback>
                {m.full_name?.[0] || m.display_name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="line-clamp-1">
              {m.full_name || m.display_name || m.email}
            </span>
          </div>
        );
      }
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
              <Users className="h-4 w-4" />
              <span>
                {managers.length}
                <span className="ml-1 hidden sm:inline">
                  {t(`${namespace}.managers`)}
                </span>
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="flex flex-col gap-2 p-4">
              <h4 className="font-medium leading-none">
                {t(`${namespace}.managers`)}
              </h4>
              <div className="grid gap-2">
                {managers.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.avatar_url || undefined} />
                      <AvatarFallback>
                        {m.full_name?.[0] || m.display_name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium text-sm">
                        {m.full_name || m.display_name}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {m.email}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
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
      <GroupAttendanceStats
        wsId={row.original.ws_id}
        groupId={row.original.id}
        count={row.original.amount || 0}
      />
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
    cell: ({ row }) => <div>{row.getValue('amount')}</div>,
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
