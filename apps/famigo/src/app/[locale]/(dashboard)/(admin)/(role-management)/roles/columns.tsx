'use client';

import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { NovaRole } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Loader2 } from '@tuturuuu/ui/icons';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { NovaRoleRowActions } from './row-actions';

export const getNovaRoleColumns = (
  t: (key: string) => string
): ColumnDef<NovaRole>[] => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ['ai-whitelist'] });

  const toggleMutation = useMutation({
    mutationFn: async ({
      email,
      enabled,
      allow_challenge_management,
      allow_manage_all_challenges,
      allow_role_management,
    }: {
      email: string;
      enabled: boolean;
      allow_challenge_management: boolean;
      allow_manage_all_challenges: boolean;
      allow_role_management: boolean;
    }) => {
      const res = await fetch(`/api/v1/infrastructure/whitelist/${email}`, {
        method: 'PUT',
        body: JSON.stringify({
          email,
          enabled,
          allow_challenge_management,
          allow_manage_all_challenges,
          allow_role_management,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to toggle whitelist status');
      }

      return res.json();
    },
    onMutate: async ({ email, enabled }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['ai-whitelist'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<NovaRole[]>([
        'ai-whitelist',
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<NovaRole[]>(['ai-whitelist'], (old) => {
        if (!old) return [];
        return old.map((item) =>
          item.email === email ? { ...item, enabled } : item
        );
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(['ai-whitelist'], context.previousData);
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
      accessorKey: 'email',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Email" />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue('email')}</div>
      ),
    },
    {
      accessorKey: 'enabled',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`common.enabled`)}
        />
      ),
      cell: ({ row }) => {
        const email = row.getValue('email') as string;
        const enabled = row.getValue('enabled') as boolean;
        const allowChallengeManagement = row.getValue(
          'allow_challenge_management'
        ) as boolean;
        const allowManageAllChallenges = row.getValue(
          'allow_manage_all_challenges'
        ) as boolean;
        const allowRoleManagement = row.getValue(
          'allow_role_management'
        ) as boolean;

        const isLoading =
          (toggleMutation.isPending &&
            toggleMutation.variables?.email === email) ||
          (isFetching > 0 && toggleMutation.variables?.email === email);

        return (
          <div className="flex items-center gap-2">
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  email,
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
      accessorKey: 'allow_challenge_management',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`common.allow_challenge_management`)}
        />
      ),
      cell: ({ row }) => {
        const email = row.getValue('email') as string;
        const enabled = row.getValue('enabled') as boolean;
        const allowChallengeManagement = row.getValue(
          'allow_challenge_management'
        ) as boolean;
        const allowManageAllChallenges = row.getValue(
          'allow_manage_all_challenges'
        ) as boolean;
        const allowRoleManagement = row.getValue(
          'allow_role_management'
        ) as boolean;

        const isLoading =
          (toggleMutation.isPending &&
            toggleMutation.variables?.email === email) ||
          (isFetching > 0 && toggleMutation.variables?.email === email);

        return (
          <div className="flex items-center gap-2">
            <Switch
              id="allow_challenge_management"
              checked={allowChallengeManagement}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  email,
                  enabled,
                  allow_challenge_management: checked,
                  allow_manage_all_challenges:
                    checked && allowManageAllChallenges,
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
      accessorKey: 'allow_manage_all_challenges',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`common.allow_manage_all_challenges`)}
        />
      ),
      cell: ({ row }) => {
        const email = row.getValue('email') as string;
        const enabled = row.getValue('enabled') as boolean;
        const allowChallengeManagement = row.getValue(
          'allow_challenge_management'
        ) as boolean;
        const allowManageAllChallenges = row.getValue(
          'allow_manage_all_challenges'
        ) as boolean;
        const allowRoleManagement = row.getValue(
          'allow_role_management'
        ) as boolean;

        const isLoading =
          (toggleMutation.isPending &&
            toggleMutation.variables?.email === email) ||
          (isFetching > 0 && toggleMutation.variables?.email === email);

        return (
          <div className="flex items-center gap-2">
            <Switch
              id="allow_manage_all_challenges"
              checked={allowManageAllChallenges}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  email,
                  enabled,
                  allow_challenge_management: allowChallengeManagement,
                  allow_manage_all_challenges: checked,
                  allow_role_management: allowRoleManagement,
                })
              }
              disabled={isLoading || !allowChallengeManagement}
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        );
      },
    },
    {
      accessorKey: 'allow_role_management',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`common.allow_role_management`)}
        />
      ),
      cell: ({ row }) => {
        const email = row.getValue('email') as string;
        const enabled = row.getValue('enabled') as boolean;
        const allowChallengeManagement = row.getValue(
          'allow_challenge_management'
        ) as boolean;
        const allowManageAllChallenges = row.getValue(
          'allow_manage_all_challenges'
        ) as boolean;
        const allowRoleManagement = row.getValue(
          'allow_role_management'
        ) as boolean;

        const isLoading =
          (toggleMutation.isPending &&
            toggleMutation.variables?.email === email) ||
          (isFetching > 0 && toggleMutation.variables?.email === email);

        return (
          <div className="flex items-center gap-2">
            <Switch
              id="allow_role_management"
              checked={allowRoleManagement}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  email,
                  enabled,
                  allow_challenge_management: allowChallengeManagement,
                  allow_manage_all_challenges: allowManageAllChallenges,
                  allow_role_management: checked,
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
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`ws-users.created_at`)}
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
      cell: ({ row }) => <NovaRoleRowActions row={row} />,
    },
  ];
};
