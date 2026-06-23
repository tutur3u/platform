'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import { updateAIWhitelistEmail } from '@tuturuuu/internal-api/infrastructure/ai';
import type { AIWhitelistEmail } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AI_WHITELIST_EMAILS_QUERY_KEY } from './query-keys';
import { AIWhitelistEmailRowActions } from './row-actions';

interface AIWhitelistEmailEnabledSwitchProps {
  email: string;
  enabled: boolean;
}

function AIWhitelistEmailEnabledSwitch({
  email,
  enabled,
}: AIWhitelistEmailEnabledSwitchProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);

  useEffect(() => {
    setChecked(enabled);
  }, [enabled]);

  const updateMutation = useMutation({
    mutationFn: (nextEnabled: boolean) =>
      updateAIWhitelistEmail(email, { enabled: nextEnabled }),
    onError: () => {
      setChecked(enabled);
      toast.error(t('common.error'), {
        description: t('common.error_saving'),
      });
    },
    onMutate: (nextEnabled) => {
      setChecked(nextEnabled);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: AI_WHITELIST_EMAILS_QUERY_KEY,
      });
      router.refresh();
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Switch
        aria-label={t('common.enabled')}
        checked={checked}
        disabled={updateMutation.isPending}
        onCheckedChange={(nextChecked) => updateMutation.mutate(nextChecked)}
      />
      {updateMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : null}
    </div>
  );
}

export const getAIWhitelistEmailColumns = ({
  t,
}: ColumnGeneratorOptions<AIWhitelistEmail>): ColumnDef<AIWhitelistEmail>[] => {
  const translate = typeof t === 'function' ? t : (key: string) => key;

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
          title={translate('common.enabled')}
        />
      ),
      cell: ({ row }) => (
        <AIWhitelistEmailEnabledSwitch
          email={row.getValue('email') as string}
          enabled={row.getValue('enabled') as boolean}
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
