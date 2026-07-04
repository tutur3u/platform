'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * Manages the workspace default currency via the shared `DEFAULT_CURRENCY`
 * workspace config. Inventory price displays, new costing profiles, and new
 * storefronts inherit this value (storefronts can still override it).
 */
export function InventoryCurrencySettings({ wsId }: { wsId: string }) {
  const t = useTranslations('settings.inventory');
  const queryClient = useQueryClient();
  const { data: currencyConfig, isLoading } = useWorkspaceConfig<string>(
    wsId,
    'DEFAULT_CURRENCY',
    'USD'
  );

  const [selected, setSelected] = useState<SupportedCurrency>('USD');
  const [initial, setInitial] = useState<SupportedCurrency>('USD');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const value = (currencyConfig as SupportedCurrency) || 'USD';
    setInitial(value);
    if (!initialized) {
      setSelected(value);
      setInitialized(true);
    }
  }, [isLoading, currencyConfig, initialized]);

  const isDirty = selected !== initial;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/DEFAULT_CURRENCY`,
        {
          body: JSON.stringify({ value: selected }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        }
      );
      if (!res.ok) throw new Error('Failed to update currency');
      return res.json();
    },
    onError: () => toast.error(t('currency_update_error')),
    onSuccess: () => {
      setInitial(selected);
      queryClient.setQueryData(
        ['workspace-config', wsId, 'DEFAULT_CURRENCY'],
        selected
      );
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', wsId, 'DEFAULT_CURRENCY'],
      });
      toast.success(t('currency_update_success'));
    },
  });

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        updateMutation.mutate();
      }}
    >
      <Select
        onValueChange={(value) => setSelected(value as SupportedCurrency)}
        value={selected}
      >
        <SelectTrigger className="max-w-sm">
          <SelectValue placeholder={t('currency_placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_CURRENCIES.map((entry) => (
            <SelectItem key={entry.code} value={entry.code}>
              {entry.name} ({entry.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        className="w-fit"
        disabled={isLoading || updateMutation.isPending || !isDirty}
        type="submit"
      >
        {updateMutation.isPending ? t('currency_saving') : t('currency_save')}
      </Button>
    </form>
  );
}
