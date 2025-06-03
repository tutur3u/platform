'use client';

import { AIWhitelistEmailRowActions } from './row-actions';
import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { AIWhitelistEmail } from '@ncthub/types/db';
import { DataTableColumnHeader } from '@ncthub/ui/custom/tables/data-table-column-header';
import { Loader2 } from '@ncthub/ui/icons';
import { Switch } from '@ncthub/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';

export const getAIWhitelistEmailColumns = (
  t: any
): ColumnDef<AIWhitelistEmail>[] => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ['ai-whitelist'] });

  const toggleMutation = useMutation({
    mutationFn: async ({
      email,
      enabled,
    }: {
      email: string;
      enabled: boolean;
    }) => {
      const res = await fetch(`/api/v1/infrastructure/ai/whitelist/${email}`, {
        method: 'PUT',
        body: JSON.stringify({ email, enabled }),
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
      const previousData = queryClient.getQueryData<AIWhitelistEmail[]>([
        'ai-whitelist',
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<AIWhitelistEmail[]>(['ai-whitelist'], (old) => {
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
              id="enabled"
              checked={enabled}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ email, enabled: checked })
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
      cell: ({ row }) => <AIWhitelistEmailRowActions row={row} />,
    },
  ];
};
