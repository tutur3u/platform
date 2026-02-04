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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  workspaceId: string;
}

type SupportedCurrency = 'VND' | 'USD' | 'PHP' | 'EUR';

export default function DefaultCurrencySettings({ workspaceId }: Props) {
  const t = useTranslations('ws-finance-settings');
  const router = useRouter();
  const { data: currencyConfig, isLoading: isLoadingConfig } =
    useWorkspaceConfig<SupportedCurrency>(
      workspaceId,
      'DEFAULT_CURRENCY',
      'USD'
    );

  const queryClient = useQueryClient();

  const [selectedCurrency, setSelectedCurrency] =
    useState<SupportedCurrency>('USD');
  const [initialCurrency, setInitialCurrency] =
    useState<SupportedCurrency>('USD');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoadingConfig) return;

    const val = (currencyConfig as SupportedCurrency) || 'USD';

    setInitialCurrency(val);
    if (!initialized) {
      setSelectedCurrency(val);
      setInitialized(true);
    }
  }, [isLoadingConfig, currencyConfig, initialized]);

  const isDirty = selectedCurrency !== initialCurrency;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/DEFAULT_CURRENCY`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: selectedCurrency }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      setInitialCurrency(selectedCurrency);
      // Directly set the new value in cache (bypasses staleTime)
      queryClient.setQueryData(
        ['workspace-config', workspaceId, 'DEFAULT_CURRENCY'],
        selectedCurrency
      );
      // Also invalidate to ensure consistency
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, 'DEFAULT_CURRENCY'],
      });
      // Refresh Server Components to use the new currency setting
      router.refresh();
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
        <h3 className="font-medium text-lg">{t('default_currency_title')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('default_currency_description')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-2">
          <Label>{t('default_currency_label')}</Label>
          <Select
            onValueChange={(val) =>
              setSelectedCurrency(val as SupportedCurrency)
            }
            value={selectedCurrency}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('default_currency_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">{t('currency_eur')}</SelectItem>
              <SelectItem value="PHP">{t('currency_php')}</SelectItem>
              <SelectItem value="USD">{t('currency_usd')}</SelectItem>
              <SelectItem value="VND">{t('currency_vnd')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          disabled={isLoadingConfig || updateMutation.isPending || !isDirty}
        >
          {updateMutation.isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </div>
  );
}
