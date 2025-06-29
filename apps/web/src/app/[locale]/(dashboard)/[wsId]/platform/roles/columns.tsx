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
  Check,
  Clock,
  Crown,
  Loader2,
  MoreHorizontal,
  Settings,
  Shield,
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

export const getPlatformRoleColumns = (
  t: any,
  _: string | undefined,
  __: any[] | undefined,
  extraData: { locale: string }
): ColumnDef<User & PlatformUser & Partial<UserPrivateDetails>>[] => {
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
      const res = await fetch(`/api/v1/platform/users/${userId}/roles`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled,
          allow_challenge_management,
          allow_manage_all_challenges,
          allow_role_management,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update user role');
      }

      return res.json();
    },
    onMutate: async ({ userId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['platform-roles'] });

      const previousData = queryClient.getQueryData<
        (User & PlatformUser & UserPrivateDetails)[]
      >(['platform-roles']);

      queryClient.setQueryData<(User & PlatformUser & UserPrivateDetails)[]>(
        ['platform-roles'],
        (old) => {
          if (!old) return [];

          return old.map((user) =>
            user.id === userId ? { ...user, enabled } : user
          );
        }
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

  const getRoleConfig = (
    user: User & PlatformUser & Partial<UserPrivateDetails>
  ) => {
    if (user.allow_role_management) {
      return {
        label: 'Admin',
        icon: <Crown className="h-3 w-3" />,
        variant: 'destructive' as const,
        className: 'text-dynamic-red bg-dynamic-red/10 border-dynamic-red/30',
        description: 'Full platform administration access',
      };
    }

    if (user.allow_manage_all_challenges) {
      return {
        label: 'Global Manager',
        icon: <Settings className="h-3 w-3" />,
        variant: 'secondary' as const,
        className:
          'text-dynamic-blue bg-dynamic-blue/10 border-dynamic-blue/30',
        description: 'Can manage all platform challenges',
      };
    }

    if (user.allow_challenge_management) {
      return {
        label: 'Challenge Manager',
        icon: <Shield className="h-3 w-3" />,
        variant: 'outline' as const,
        className:
          'text-dynamic-purple bg-dynamic-purple/10 border-dynamic-purple/30',
        description: 'Can manage specific challenges',
      };
    }

    return {
      label: 'Member',
      icon: <Users className="h-3 w-3" />,
      variant: 'outline' as const,
      className: 'text-dynamic-muted-foreground',
      description: 'Regular platform user',
    };
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
            <Avatar className="h-9 w-9 border">
              <AvatarImage
                src={user.avatar_url || ''}
                alt={user?.display_name || ''}
              />
              <AvatarFallback className="text-xs font-medium">
                {getInitials(user.display_name || '?')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {user.display_name ||
                  generateFunName({ id: user.id, locale: extraData.locale })}
              </div>
              {user?.email && (
                <div className="text-sm text-dynamic-muted-foreground truncate">
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
        <DataTableColumnHeader t={t} column={column} title="Status" />
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
          <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-1">
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-dynamic-muted-foreground" />
              ) : (
                <span
                  className={`text-xs font-medium ${
                    enabled
                      ? 'text-dynamic-green'
                      : 'text-dynamic-muted-foreground'
                  }`}
                >
                  {enabled ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'platform_role',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Role" />
      ),
      cell: ({ row }) => {
        const user = row.original;
        const roleConfig = getRoleConfig(user);

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={roleConfig.variant}
                  className={`${roleConfig.className} gap-1 font-medium`}
                >
                  {roleConfig.icon}
                  {roleConfig.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-sm">{roleConfig.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const user = row.original;
        const userId = user.id;
        const allowChallengeManagement = user.allow_challenge_management;
        const allowManageAllChallenges = user.allow_manage_all_challenges;
        const allowRoleManagement = user.allow_role_management;

        const isLoading =
          toggleMutation.isPending &&
          toggleMutation.variables?.userId === userId;

        const _isRoleEnabled = (roleKey: string) => {
          switch (roleKey) {
            case 'admin':
              return allowRoleManagement;
            case 'global_manager':
              return allowManageAllChallenges;
            case 'challenge_manager':
              return allowChallengeManagement;
            default:
              return false;
          }
        };

        const setRole = (roleKey: string) => {
          let newAllowChallengeManagement = false;
          let newAllowManageAllChallenges = false;
          let newAllowRoleManagement = false;

          switch (roleKey) {
            case 'admin':
              newAllowRoleManagement = true;
              break;
            case 'global_manager':
              newAllowManageAllChallenges = true;
              break;
            case 'challenge_manager':
              newAllowChallengeManagement = true;
              break;
            default:
              // All permissions are false by default
              break;
          }

          toggleMutation.mutate({
            userId,
            enabled: user.enabled || false,
            allow_challenge_management: newAllowChallengeManagement,
            allow_manage_all_challenges: newAllowManageAllChallenges,
            allow_role_management: newAllowRoleManagement,
          });
        };

        const currentRole = (() => {
          if (allowRoleManagement) return 'admin';
          if (allowManageAllChallenges) return 'global_manager';
          if (allowChallengeManagement) return 'challenge_manager';
          return 'member';
        })();

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-dynamic-accent"
                disabled={isLoading}
              >
                <span className="sr-only">Open actions menu</span>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-sm font-medium">
                Change Role
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setRole('member')}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-dynamic-muted-foreground" />
                  <div>
                    <div className="font-medium">Member</div>
                    <div className="text-xs text-dynamic-muted-foreground">
                      Regular platform user
                    </div>
                  </div>
                </div>
                {currentRole === 'member' && (
                  <Check className="h-4 w-4 text-dynamic-green" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRole('challenge_manager')}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-dynamic-purple" />
                  <div>
                    <div className="font-medium">Challenge Manager</div>
                    <div className="text-xs text-dynamic-muted-foreground">
                      Manage specific challenges
                    </div>
                  </div>
                </div>
                {currentRole === 'challenge_manager' && (
                  <Check className="h-4 w-4 text-dynamic-green" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRole('global_manager')}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <Settings className="h-4 w-4 text-dynamic-blue" />
                  <div>
                    <div className="font-medium">Global Manager</div>
                    <div className="text-xs text-dynamic-muted-foreground">
                      Manage all challenges
                    </div>
                  </div>
                </div>
                {currentRole === 'global_manager' && (
                  <Check className="h-4 w-4 text-dynamic-green" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRole('admin')}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <Crown className="h-4 w-4 text-dynamic-red" />
                  <div>
                    <div className="font-medium">Admin</div>
                    <div className="text-xs text-dynamic-muted-foreground">
                      Full platform access
                    </div>
                  </div>
                </div>
                {currentRole === 'admin' && (
                  <Check className="h-4 w-4 text-dynamic-green" />
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
};
