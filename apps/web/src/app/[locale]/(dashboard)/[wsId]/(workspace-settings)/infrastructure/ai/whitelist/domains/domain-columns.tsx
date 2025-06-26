'use client';

import {
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AIWhitelistDomain } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Loader2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { AIWhitelistDomainRowActions } from './domain-row-actions';

export const getAIWhitelistDomainColumns = (
  t: (key: string) => string
): ColumnDef<AIWhitelistDomain>[] => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ['ai-whitelist-domains'] });
  const domainId = useId();

  const toggleMutation = useMutation({
    mutationFn: async ({
      domain,
      enabled,
    }: {
      domain: string;
      enabled: boolean;
    }) => {
      const res = await fetch(
        `/api/v1/infrastructure/ai/whitelist/domain/${domain}`,
        {
          method: 'PUT',
          body: JSON.stringify({ domain, enabled }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to toggle whitelist status');
      }

      return res.json();
    },
    onMutate: async ({ domain, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['ai-whitelist-domains'] });
      const previousData = queryClient.getQueryData<AIWhitelistDomain[]>([
        'ai-whitelist-domains',
      ]);

      queryClient.setQueryData<AIWhitelistDomain[]>(
        ['ai-whitelist-domains'],
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
        queryClient.setQueryData(
          ['ai-whitelist-domains'],
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-whitelist-domains'] });
      router.refresh();
    },
  });

  return [
    {
      accessorKey: 'domain',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Domain" />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">
          <label
            htmlFor={`${domainId}-${row.original.id}`}
            className="text-sm font-medium"
          >
            {row.getValue('domain')}
          </label>
          <Input
            id={`${domainId}-${row.original.id}`}
            value={row.getValue('domain')}
            onChange={(e) =>
              toggleMutation.mutate({
                domain: e.target.value,
                enabled: row.getValue('enabled') as boolean,
              })
            }
            placeholder={t('enter_domain')}
          />
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Description" />
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
          title={t(`common.enabled`)}
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
              id="enabled"
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
      cell: ({ row }) => <AIWhitelistDomainRowActions row={row} />,
    },
  ];
};
