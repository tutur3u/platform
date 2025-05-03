'use client';

import { ColumnDef } from '@tanstack/react-table';
import type { User, UserPrivateDetails } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Badge, Shield, ShieldAlert, UserIcon } from '@tuturuuu/ui/icons';
import { getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';

export const getUserColumns = (
  t: any
): ColumnDef<User & UserPrivateDetails>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="ID" />
    ),
  },
  {
    accessorKey: 'display_name',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="User" />
    ),
    cell: ({ row }) => {
      const user = row.original;

      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={user.avatar_url || ''}
              alt={user?.display_name || ''}
            />
            <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.display_name}</div>
            {user?.email && (
              <div className="text-sm text-muted-foreground">{user.email}</div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'role',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const role = row.getValue('role') as string | undefined;
      if (!role) return null;

      switch (role.toLowerCase()) {
        case 'admin':
          return (
            <Badge className="border-red-200 bg-red-50 text-red-700">
              <ShieldAlert className="mr-1 h-3 w-3" />
              Admin
            </Badge>
          );
        case 'moderator':
          return (
            <Badge className="border-purple-200 bg-purple-50 text-purple-700">
              <Shield className="mr-1 h-3 w-3" />
              Moderator
            </Badge>
          );
        case 'user':
          return (
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">
              <UserIcon className="mr-1 h-3 w-3" />
              User
            </Badge>
          );
        default:
          return (
            <Badge className="border-gray-200 bg-gray-50 text-gray-700">
              {role}
            </Badge>
          );
      }
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Created At" />
    ),
    cell: ({ row }) => {
      const created_at = row.getValue('created_at') as string;
      return moment(created_at).format('DD/MM/YYYY');
    },
  },
];
