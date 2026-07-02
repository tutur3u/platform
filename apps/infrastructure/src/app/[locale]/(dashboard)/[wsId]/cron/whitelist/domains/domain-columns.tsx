'use client';

import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import {
  type ManagedCronWhitelistedDomain,
  updateManagedCronWhitelistedDomain,
} from '@tuturuuu/internal-api/infrastructure';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { ManagedCronWhitelistDomainRowActions } from './domain-row-actions';

const QUERY_KEY = ['managed-cron-whitelist-domains'];

export const getManagedCronWhitelistDomainColumns = ({
  t,
}: ColumnGeneratorOptions<ManagedCronWhitelistedDomain>): ColumnDef<ManagedCronWhitelistedDomain>[] => {
  const translate = typeof t === 'function' ? t : (key: string) => key;
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: QUERY_KEY });

  const toggleMutation = useMutation({
    mutationFn: async ({
      domain,
      enabled,
    }: {
      domain: string;
      enabled: boolean;
    }) => {
      return updateManagedCronWhitelistedDomain(domain, { enabled });
    },
    onMutate: async ({ domain, enabled }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previousData =
        queryClient.getQueryData<ManagedCronWhitelistedDomain[]>(QUERY_KEY);

      queryClient.setQueryData<ManagedCronWhitelistedDomain[]>(
        QUERY_KEY,
        (old) => {
          if (!old) return [];
          return old.map((item) =>
            item.domain === domain ? { ...item, enabled } : item
          );
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEY, context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      router.refresh();
    },
  });

  return [
    {
      accessorKey: 'domain',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={translate('managed-cron-whitelist.domain_label')}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue('domain')}</div>
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={translate('managed-cron-whitelist.description_label')}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-2">{row.getValue('description') || '-'}</div>
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
        const domain = row.getValue('domain') as string;
        const enabled = row.getValue('enabled') as boolean;
        const isLoading =
          (toggleMutation.isPending &&
            toggleMutation.variables?.domain === domain) ||
          (isFetching > 0 && toggleMutation.variables?.domain === domain);

        return (
          <div className="flex items-center gap-2">
            <Switch
              id={`managed-cron-domain-${domain}`}
              checked={enabled}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ domain, enabled: checked })
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
      cell: ({ row }) => <ManagedCronWhitelistDomainRowActions row={row} />,
    },
  ];
};
