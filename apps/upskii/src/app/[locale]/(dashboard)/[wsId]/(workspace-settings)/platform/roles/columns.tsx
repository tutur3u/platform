'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
  Building,
  Clock,
  Crown,
  Loader2,
  MoreHorizontal,
  Users,
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
import type { PlatformUserWithDetails } from './page';

export const getPlatformRoleColumns = (
  // biome-ignore lint/suspicious/noExplicitAny: <translation function is not typed>
  t: any,
  _: string | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: <this parameter is not used>
  __: any[] | undefined,
  extraData: { locale: string }
): ColumnDef<PlatformUserWithDetails>[] => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: async ({
      userId,
      allow_role_management,
      allow_workspace_creation,
    }: {
      userId: string;
      allow_role_management: boolean;
      allow_workspace_creation: boolean;
    }) => {
      const res = await fetch(`/api/v1/platform/users/${userId}/roles`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allow_role_management,
          allow_workspace_creation,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update user role');
      }

      return res.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['platform-roles'] });

      const previousData = queryClient.getQueryData<
        (User & PlatformUser & UserPrivateDetails)[]
      >(['platform-roles']);

      queryClient.setQueryData<(User & PlatformUser & UserPrivateDetails)[]>(
        ['platform-roles'],
        (old) =>
          old?.map((user) =>
            user.id === variables.userId ? { ...user, ...variables } : user
          ) ?? []
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['platform-roles'], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-roles'] });
      router.refresh();
    },
  });

  const getUserPermissions = (user: PlatformUserWithDetails) => {
    const permissions = [];

    if (user.allow_role_management) {
      permissions.push({
        label: 'Admin',
        shortLabel: 'ADM',
        icon: <Crown className="h-3 w-3" />,
        variant: 'destructive' as const,
        className:
          'text-dynamic-red bg-dynamic-red/10 border-dynamic-red/30 font-semibold',
        description: 'Full platform administration access',
        priority: 1,
      });
    }

    if (user.allow_workspace_creation) {
      permissions.push({
        label: 'Workspace Creator',
        shortLabel: 'WC',
        icon: <Building className="h-3 w-3" />,
        variant: 'outline' as const,
        className:
          'text-dynamic-green bg-dynamic-green/10 border-dynamic-green/30 font-medium',
        description: 'Can create and initialize new workspaces',
        priority: 4,
      });
    }

    if (permissions.length === 0) {
      permissions.push({
        label: 'Member',
        shortLabel: 'MBR',
        icon: <Users className="h-3 w-3" />,
        variant: 'outline' as const,
        className:
          'text-dynamic-muted-foreground bg-dynamic-muted/5 border-dynamic-muted/20 font-normal',
        description: 'Regular platform user with basic access',
        priority: 5,
      });
    }

    return permissions.sort((a, b) => a.priority - b.priority);
  };

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
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <Avatar
                className={`h-9 w-9 border-2 transition-all ${'border-dynamic-green/30 shadow-sm'}`}
              >
                <AvatarImage
                  src={user.avatar_url || ''}
                  alt={user?.display_name || ''}
                />
                <AvatarFallback className="text-xs font-medium">
                  {getInitials(user.display_name || '?')}
                </AvatarFallback>
              </Avatar>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${'bg-dynamic-green'}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={`font-medium truncate transition-opacity ${'opacity-100'}`}
              >
                {user.display_name ||
                  generateFunName({ id: user.id, locale: extraData.locale })}
              </div>
              {user?.email && (
                <div
                  className={`text-sm truncate transition-opacity ${'text-dynamic-muted-foreground'}`}
                >
                  {user.email}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'platform_role',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Permissions" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        const permissions = getUserPermissions(user);

        return (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <TooltipProvider key={permission.label}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={permission.variant}
                        className={`${permission.className} gap-1.5 text-xs transition-all hover:scale-105`}
                      >
                        {permission.icon}
                        <span className="hidden sm:inline">
                          {permission.label}
                        </span>
                        <span className="sm:hidden font-mono text-[10px]">
                          {permission.shortLabel}
                        </span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-medium">{permission.label}</p>
                        <p className="text-xs text-dynamic-muted-foreground">
                          {permission.description}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'allow_role_management',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Admin" />
      ),
      cell: ({ row }) => {
        const userId = row.original.id;
        const user = row.original;
        const isLoading =
          toggleMutation.isPending &&
          toggleMutation.variables?.userId === userId;

        return (
          <div className="flex items-center justify-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Switch
                      checked={user.allow_role_management}
                      onCheckedChange={(checked) => {
                        // Add confirmation for admin role changes
                        if (checked && !user.allow_role_management) {
                          if (
                            !confirm(
                              'Are you sure you want to grant admin privileges? This gives full platform access.'
                            )
                          ) {
                            return;
                          }
                        }
                        toggleMutation.mutate({
                          userId,
                          allow_role_management: checked,
                          allow_workspace_creation:
                            user.allow_workspace_creation ?? false,
                        });
                      }}
                      disabled={isLoading}
                      className={`transition-all ${
                        user.allow_role_management
                          ? 'data-[state=checked]:bg-dynamic-red'
                          : ''
                      }`}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-3 w-3 animate-spin text-dynamic-red" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium flex items-center gap-1.5">
                      <Crown className="h-3 w-3 text-dynamic-red" />
                      Admin Permission
                    </p>
                    <p className="text-xs text-dynamic-muted-foreground">
                      {user.allow_role_management
                        ? 'User has full platform administration access'
                        : 'Grant complete platform control and user management'}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    },
    {
      accessorKey: 'allow_workspace_creation',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Workspace" />
      ),
      cell: ({ row }) => {
        const userId = row.original.id;
        const user = row.original;
        const isLoading =
          toggleMutation.isPending &&
          toggleMutation.variables?.userId === userId;

        return (
          <div className="flex items-center justify-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Switch
                      checked={user.allow_workspace_creation ?? false}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({
                          userId,
                          allow_role_management: user.allow_role_management,
                          allow_workspace_creation: checked,
                        })
                      }
                      disabled={isLoading}
                      className={`transition-all ${
                        user.allow_workspace_creation
                          ? 'data-[state=checked]:bg-dynamic-green'
                          : ''
                      } `}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-3 w-3 animate-spin text-dynamic-green" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium flex items-center gap-1.5">
                      <Building className="h-3 w-3 text-dynamic-green" />
                      Workspace Creator
                    </p>
                    <p className="text-xs text-dynamic-muted-foreground">
                      {user.allow_workspace_creation
                        ? 'Can create and initialize new workspaces'
                        : 'Grant ability to create new workspaces'}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Joined" />
      ),
      cell: ({ row }) => {
        const createdAt = row.getValue('created_at') as string;
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-sm text-dynamic-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{moment(createdAt).fromNow()}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">
                  {moment(createdAt).format('MMMM Do YYYY, h:mm:ss a')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Manage Permissions</span>,
      cell: ({ row }) => {
        const user = row.original;
        const userId = user.id;
        const allowRoleManagement = user.allow_role_management;
        const allowWorkspaceCreation = user.allow_workspace_creation ?? false;

        const isLoading =
          toggleMutation.isPending &&
          toggleMutation.variables?.userId === userId;

        const togglePermission = (
          permission: string,
          currentValue: boolean
        ) => {
          const updates = {
            userId,
            allow_role_management: allowRoleManagement,
            allow_workspace_creation: allowWorkspaceCreation,
          };

          // Update the specific permission
          switch (permission) {
            case 'admin':
              if (
                !currentValue &&
                !confirm(
                  'Are you sure you want to grant admin privileges? This gives complete platform control.'
                )
              ) {
                return;
              }
              updates.allow_role_management = !currentValue;
              break;
            case 'workspace_creator':
              updates.allow_workspace_creation = !currentValue;
              break;
          }

          toggleMutation.mutate(updates);
        };

        const clearAllPermissions = () => {
          if (
            !confirm(
              'Are you sure you want to remove all permissions? This will make the user a regular member.'
            )
          ) {
            return;
          }

          toggleMutation.mutate({
            userId,
            allow_role_management: false,
            allow_workspace_creation: false,
          });
        };

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-dynamic-accent"
                disabled={isLoading}
              >
                <span className="sr-only">Manage user permissions</span>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-sm font-medium">
                Manage Permissions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Admin Permission */}
              <DropdownMenuItem
                onClick={() => togglePermission('admin', allowRoleManagement)}
                className="flex items-center justify-between p-3 focus:bg-dynamic-accent/50"
              >
                <div className="flex items-center gap-3">
                  <Crown className="h-4 w-4 text-dynamic-red" />
                  <div>
                    <div className="font-medium">Admin</div>
                    <div className="text-xs text-dynamic-muted-foreground">
                      Full platform administration access
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={allowRoleManagement}
                    onCheckedChange={() =>
                      togglePermission('admin', allowRoleManagement)
                    }
                    disabled={isLoading}
                    className="data-[state=checked]:bg-dynamic-red"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </DropdownMenuItem>

              {/* Workspace Creator Permission */}
              <DropdownMenuItem
                onClick={() =>
                  togglePermission('workspace_creator', allowWorkspaceCreation)
                }
                className="flex items-center justify-between p-3 focus:bg-dynamic-accent/50"
              >
                <div className="flex items-center gap-3">
                  <Building className="h-4 w-4 text-dynamic-green" />
                  <div>
                    <div className="font-medium">Workspace Creator</div>
                    <div className="text-xs text-dynamic-muted-foreground">
                      Can create new workspaces
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={allowWorkspaceCreation}
                    onCheckedChange={() =>
                      togglePermission(
                        'workspace_creator',
                        allowWorkspaceCreation
                      )
                    }
                    disabled={isLoading}
                    className="data-[state=checked]:bg-dynamic-green"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Quick Actions */}
              <DropdownMenuItem
                onClick={clearAllPermissions}
                className="flex items-center gap-3 p-3 text-dynamic-muted-foreground hover:text-dynamic-foreground focus:bg-dynamic-accent/50"
                disabled={!allowRoleManagement && !allowWorkspaceCreation}
              >
                <Users className="h-4 w-4" />
                <div>
                  <div className="font-medium">Clear All Permissions</div>
                  <div className="text-xs text-dynamic-muted-foreground">
                    Remove all permissions (Member only)
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
};
