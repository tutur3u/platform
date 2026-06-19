'use client';

import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import { updateAIWhitelistEmail } from '@tuturuuu/internal-api/infrastructure/ai';
import type { AIWhitelistEmail } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { AIWhitelistEmailRowActions } from './row-actions';

export const getAIWhitelistEmailColumns = ({
  t,
}: ColumnGeneratorOptions<AIWhitelistEmail>): ColumnDef<AIWhitelistEmail>[] => {
  const translate = typeof t === 'function' ? t : (key: string) => key;
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ['ai-whitelist-emails'] });

  const toggleMutation = useMutation({
    mutationFn: async ({
      email,
      enabled,
    }: {
      email: string;
      enabled: boolean;
    }) => {
      return updateAIWhitelistEmail(email, { enabled });
    },
    onMutate: async ({ email, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['ai-whitelist-emails'] });

      const previousData = queryClient.getQueryData<AIWhitelistEmail[]>([
        'ai-whitelist-emails',
      ]);

      queryClient.setQueryData<AIWhitelistEmail[]>(
        ['ai-whitelist-emails'],
        (old) => {
          if (!old) return [];
          return old.map((item) =>
            item.email === email ? { ...item, enabled } : item
          );
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['ai-whitelist-emails'], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-whitelist-emails'] });
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
          title={translate('common.enabled')}
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
          title={translate('ws-users.created_at')}
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
