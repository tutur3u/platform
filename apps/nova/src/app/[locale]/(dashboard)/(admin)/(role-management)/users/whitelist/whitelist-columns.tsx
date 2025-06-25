'use client';

import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { NovaRoleBasic } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Loader2 } from '@tuturuuu/ui/icons';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { NovaRoleRowActions } from './row-actions';

export const getNovaRoleColumns = (
  t: (key: string) => string
): ColumnDef<NovaRoleBasic>[] => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ['ai-whitelist'] });
  const switchId = useId();

  const toggleMutation = useMutation({
    mutationFn: async ({
      email,
      enabled,
    }: {
      email: string;
      enabled: boolean;
    }) => {
      const res = await fetch(`/api/v1/infrastructure/whitelist/${email}`, {
        method: 'PUT',
        body: JSON.stringify({
          email,
          enabled,
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
      const previousData = queryClient.getQueryData<NovaRoleBasic[]>([
        'ai-whitelist',
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<NovaRoleBasic[]>(['ai-whitelist'], (old) => {
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
        const isLoading =
          (toggleMutation.isPending &&
            toggleMutation.variables?.email === email) ||
          (isFetching > 0 && toggleMutation.variables?.email === email);

        return (
          <div className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={enabled}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  email,
                  enabled: checked,
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
        <DataTableColumnHeader t={t} column={column} title="Created Date" />
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
