'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useWallets } from '@/hooks/use-wallets';

interface Props {
  workspaceId: string;
}

const NONE_OPTION = 'none';

export default function DefaultWalletSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const tWallets = useTranslations('ws-wallets');
  const { data: wallets = [], isLoading: isLoadingWallets } =
    useWallets(workspaceId);
  const { data: defaultConfig, isLoading: isLoadingDefaultConfig } =
    useWorkspaceConfig(workspaceId, 'default_wallet_id', '');

  const queryClient = useQueryClient();

  const isLoading = isLoadingWallets || isLoadingDefaultConfig;

  const [selectedWalletId, setSelectedWalletId] = useState(NONE_OPTION);
  const [initialWalletId, setInitialWalletId] = useState(NONE_OPTION);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const trimmed = String(defaultConfig || '').trim();
    const walletExists = wallets.some((w) => w.id === trimmed);
    const val = walletExists ? trimmed : NONE_OPTION;

    setInitialWalletId(val);
    if (!initialized) {
      setSelectedWalletId(val);
      setInitialized(true);
    }
  }, [isLoading, defaultConfig, wallets, initialized]);

  const isDirty = selectedWalletId !== initialWalletId;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const nextValue =
        selectedWalletId && selectedWalletId !== NONE_OPTION
          ? selectedWalletId
          : '';
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/default_wallet_id`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: nextValue }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      setInitialWalletId(selectedWalletId);
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, 'default_wallet_id'],
      });
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label>{t('default_wallet_label')}</Label>
          <Select onValueChange={setSelectedWalletId} value={selectedWalletId}>
            <SelectTrigger>
              <SelectValue placeholder={t('select_default_wallet')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_OPTION}>
                {t('no_default_wallet')}
              </SelectItem>
              {wallets
                .filter((wallet) => wallet.id)
                .map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id as string}>
                    {wallet.name || tWallets('unnamed_wallet')}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          disabled={isLoading || updateMutation.isPending || !isDirty}
        >
          {updateMutation.isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </div>
  );
}
