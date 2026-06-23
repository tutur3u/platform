'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import { updateAIWhitelistDomain } from '@tuturuuu/internal-api/infrastructure/ai';
import type { AIWhitelistDomain } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AIWhitelistDomainRowActions } from './domain-row-actions';
import { AI_WHITELIST_DOMAINS_QUERY_KEY } from './query-keys';

interface DomainEnabledCellProps {
  domain: string;
  enabled: boolean;
}

function DomainEnabledCell({ domain, enabled }: DomainEnabledCellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(enabled);

  useEffect(() => {
    setChecked(enabled);
  }, [enabled]);

  const toggleMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) =>
      updateAIWhitelistDomain(domain, { enabled: nextEnabled }),
    onMutate: async (nextEnabled) => {
      const previousEnabled = checked;
      setChecked(nextEnabled);
      await queryClient.cancelQueries({
        queryKey: AI_WHITELIST_DOMAINS_QUERY_KEY,
      });

      return { previousEnabled };
    },
    onError: (_err, _variables, context) => {
      setChecked(context?.previousEnabled ?? enabled);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AI_WHITELIST_DOMAINS_QUERY_KEY,
      });
      router.refresh();
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`enabled-${domain}`}
        checked={checked}
        onCheckedChange={(nextEnabled) => toggleMutation.mutate(nextEnabled)}
        disabled={toggleMutation.isPending}
      />
      {toggleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
    </div>
  );
}

export const getAIWhitelistDomainColumns = ({
  t,
}: ColumnGeneratorOptions<AIWhitelistDomain>): ColumnDef<AIWhitelistDomain>[] => {
  const translate = typeof t === 'function' ? t : (key: string) => key;

  return [
    {
      accessorKey: 'domain',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Domain" />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue<string>('domain')}</div>
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="Description" />
      ),
      cell: ({ row }) => {
        const description = row.getValue<string | null>('description');

        return <div className="line-clamp-2">{description || '-'}</div>;
      },
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
      cell: ({ row }) => (
        <DomainEnabledCell
          domain={row.getValue<string>('domain')}
          enabled={row.getValue<boolean>('enabled')}
        />
      ),
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
      cell: ({ row }) => {
        const createdAt = row.getValue<string | null>('created_at');

        return (
          <div>
            {createdAt ? moment(createdAt).format('DD/MM/YYYY, HH:mm:ss') : '-'}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => <AIWhitelistDomainRowActions row={row} />,
    },
  ];
};
