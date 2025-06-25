'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  ChevronDown,
  Loader2,
  Shield,
  User as UserIcon,
} from '@tuturuuu/ui/icons';
import { Switch } from '@tuturuuu/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { generateFunName, getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { NovaUsersRowActions } from './row-actions';

export const getUserColumns = (
  t: (key: string) => string,
  _: string | undefined,
  __: unknown[] | undefined,
  extraData: { locale: string }
): ColumnDef<
  User & PlatformUser & Partial<UserPrivateDetails> & { team_name: string[] }
>[] => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: async ({
      userId,
      enabled,
      allow_challenge_management,
      allow_manage_all_challenges,
      allow_role_management,
    }: {
      userId: string;
      enabled: boolean;
      allow_challenge_management: boolean;
      allow_manage_all_challenges: boolean;
      allow_role_management: boolean;
    }) => {
      // apps/nova/src/app/api/v1/nova/users/[userId]/route.ts
      const res = await fetch(`/api/v1/nova/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          enabled,
          allow_challenge_management,
          allow_manage_all_challenges,
          allow_role_management,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to toggle user status');
      }

      return res.json();
    },
    onMutate: async ({ userId, enabled }) => {
      // Cancel any outgoing re-fetches
      await queryClient.cancelQueries({ queryKey: ['users-management'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<
        (User & PlatformUser & UserPrivateDetails & { team_name: string[] })[]
      >(['users-management']);

      // Optimistically update to the new value
      queryClient.setQueryData<
        (User & PlatformUser & UserPrivateDetails & { team_name: string[] })[]
      >(['users-management'], (old) => {
        if (!old) return [];

        return old.map((user) =>
          user.id === userId ? { ...user, enabled } : user
        );
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(['users-management'], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data is in sync
      queryClient.invalidateQueries({ queryKey: ['ai-whitelist'] });
      router.refresh();
    },
  });

  return [
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
              <AvatarFallback>
                {getInitials(user.display_name || '?')}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">
                {user.display_name ||
                  generateFunName({ id: user.id, locale: extraData.locale })}
              </div>
              {user?.email && (
                <div className="text-sm text-muted-foreground">
                  {user.email}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'enabled',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Enabled" />
      ),
      cell: ({ row }) => {
        const userId = row.original.id;
        const enabled = row.getValue('enabled') as boolean | undefined;
        const allowChallengeManagement =
          row.original.allow_challenge_management;
        const allowManageAllChallenges =
          row.original.allow_manage_all_challenges;
        const allowRoleManagement = row.original.allow_role_management;

        const isLoading =
          toggleMutation.isPending &&
          toggleMutation.variables?.userId === userId;

        return (
          <div className="flex items-center gap-2">
            <Switch
              id={`active-status-${userId}`}
              checked={enabled === true}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  userId,
                  enabled: checked,
                  allow_challenge_management: allowChallengeManagement,
                  allow_manage_all_challenges: allowManageAllChallenges,
                  allow_role_management: allowRoleManagement,
                })
              }
              disabled={isLoading}
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        );
      },
    },
    {
      id: 'currentRole',
      accessorFn: (row) => {
        if (row.allow_role_management) return 3;
        if (row.allow_manage_all_challenges) return 2;
        if (row.allow_challenge_management) return 1;
        return 0;
      },
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Current Role" />
      ),
      cell: ({ row }) => {
        const user = row.original;

        let roleInfo = {
          label: 'Member',
          icon: UserIcon,
          color: 'text-gray-500',
        };

        if (user.allow_role_management) {
          roleInfo = {
            label: 'Admin',
            icon: Shield,
            color: 'text-red-500',
          };
        } else if (user.allow_manage_all_challenges) {
          roleInfo = {
            label: 'Global Manager',
            icon: Shield,
            color: 'text-green-500',
          };
        } else if (user.allow_challenge_management) {
          roleInfo = {
            label: 'Challenge Manager',
            icon: Shield,
            color: 'text-blue-500',
          };
        }

        const IconComponent = roleInfo.icon;

        return (
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <IconComponent className={`h-4 w-4 ${roleInfo.color}`} />
                    <span>{roleInfo.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {user.allow_role_management &&
                    'Can manage users, roles and all platform features'}
                  {user.allow_manage_all_challenges &&
                    !user.allow_role_management &&
                    'Can edit and manage all challenges in the platform'}
                  {user.allow_challenge_management &&
                    !user.allow_manage_all_challenges &&
                    'Can only manage challenges specifically assigned to them'}
                  {!user.allow_challenge_management &&
                    !user.allow_manage_all_challenges &&
                    !user.allow_role_management &&
                    'Regular member with standard permissions'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        const user = row.original;
        const userId = user.id;

        const roleOptions = [
          { key: 'allow_challenge_management', label: 'Challenge Management' },
          {
            key: 'allow_manage_all_challenges',
            label: 'Manage All Challenges',
          },
          { key: 'allow_role_management', label: 'Role Management' },
        ];

        // Helper function to check if a role is enabled
        const isRoleEnabled = (roleKey: string) => {
          return user[roleKey as keyof typeof user] === true;
        };

        const isLoading =
          toggleMutation.isPending &&
          toggleMutation.variables?.userId === userId;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                Roles (
                {
                  roleOptions.filter((option) => isRoleEnabled(option.key))
                    .length
                }
                )
                <ChevronDown className="ml-2 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Manage Permissions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {roleOptions.map((option) => (
                <DropdownMenuItem key={option.key} className="p-0">
                  <label
                    htmlFor={`${option.key}-${userId}`}
                    className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5"
                  >
                    <Checkbox
                      id={`${option.key}-${userId}`}
                      checked={isRoleEnabled(option.key)}
                      onCheckedChange={(checked) => {
                        // Get all current permission values
                        const enabled = user.enabled ?? false;
                        const allow_challenge_management =
                          user.allow_challenge_management ?? false;
                        const allow_manage_all_challenges =
                          user.allow_manage_all_challenges ?? false;
                        const allow_role_management =
                          user.allow_role_management ?? false;

                        toggleMutation.mutate({
                          userId,
                          enabled,
                          allow_challenge_management:
                            option.key === 'allow_challenge_management'
                              ? checked === true
                              : allow_challenge_management,
                          allow_manage_all_challenges:
                            option.key === 'allow_manage_all_challenges'
                              ? checked === true
                              : allow_manage_all_challenges,
                          allow_role_management:
                            option.key === 'allow_role_management'
                              ? checked === true
                              : allow_role_management,
                        });
                      }}
                      disabled={toggleMutation.isPending}
                    />
                    <span>{option.label}</span>
                  </label>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
    {
      accessorKey: 'team_name',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Team" />
      ),
      cell: ({ row }) => {
        const team_name = row.getValue('team_name') as string[] | undefined;
        if (!team_name) return null;
        return team_name.join(', ');
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
    {
      id: 'actions',
      cell: ({ row }) => <NovaUsersRowActions row={row} />,
    },
  ];
};
