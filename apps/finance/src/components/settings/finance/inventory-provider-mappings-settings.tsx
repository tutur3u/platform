'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getInventoryFinanceMappings,
  type InventoryFinanceExternalProvider,
  putInventoryFinanceMappings,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionFooter,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';
import { useWallets } from '@/hooks/use-wallets';

const NONE = 'none';
const providers: InventoryFinanceExternalProvider[] = [
  'polar',
  'square_pos',
  'square_terminal',
];

export function InventoryProviderMappingsSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useTranslations('inventory-finance-reconciliation');
  const queryClient = useQueryClient();
  const { data: wallets = [] } = useWallets(workspaceId);
  const { data: categories = [] } = useTransactionCategories(workspaceId);
  const { data } = useQuery({
    queryKey: ['inventory-finance-mappings', workspaceId],
    queryFn: () => getInventoryFinanceMappings(workspaceId),
  });
  const [provider, setProvider] =
    useState<InventoryFinanceExternalProvider>('polar');
  const [currency, setCurrency] = useState('USD');
  const [walletId, setWalletId] = useState(NONE);
  const [categoryId, setCategoryId] = useState(NONE);
  const compatibleWallets = wallets.filter(
    (wallet) => (wallet.currency ?? '').toUpperCase() === currency
  );
  const mutation = useMutation({
    mutationFn: () =>
      putInventoryFinanceMappings(workspaceId, {
        mappings: [
          {
            categoryId: categoryId === NONE ? null : categoryId,
            currency,
            provider,
            walletId: walletId === NONE ? null : walletId,
          },
        ],
      }),
    onSuccess: async () => {
      toast.success(t('mapping_saved'));
      await queryClient.invalidateQueries({
        queryKey: ['inventory-finance-mappings', workspaceId],
      });
    },
    onError: () => toast.error(t('mapping_save_error')),
  });

  return (
    <SettingsSection
      title={t('mapping_title')}
      description={t('mapping_description')}
    >
      {(data?.mappings ?? []).map((mapping) => (
        <SettingsSectionBlock
          className="flex flex-wrap items-center gap-2 py-3 text-sm"
          key={`${mapping.provider}:${mapping.currency}`}
        >
          <Badge variant="outline">{t(`provider_${mapping.provider}`)}</Badge>
          <Badge variant="secondary">{mapping.currency}</Badge>
          <span>{mapping.wallet?.name ?? t('needs_wallet')}</span>
          <span className="text-muted-foreground">
            {mapping.category?.name ?? t('uncategorized')}
          </span>
        </SettingsSectionBlock>
      ))}

      <SettingsSectionBlock className="grid gap-3 md:grid-cols-2">
        <Select
          value={provider}
          onValueChange={(value) =>
            setProvider(value as InventoryFinanceExternalProvider)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`provider_${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={currency}
          onValueChange={(value) => {
            setCurrency(value);
            setWalletId(NONE);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['USD', 'VND', 'EUR', 'JPY', 'SGD', 'AUD'].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={walletId} onValueChange={setWalletId}>
          <SelectTrigger>
            <SelectValue placeholder={t('assign_wallet')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('needs_wallet')}</SelectItem>
            {compatibleWallets
              .filter((wallet) => wallet.id)
              .map((wallet) => (
                <SelectItem key={wallet.id} value={wallet.id as string}>
                  {wallet.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder={t('set_category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('uncategorized')}</SelectItem>
            {categories
              .filter((category) => category.id)
              .map((category) => (
                <SelectItem key={category.id} value={category.id as string}>
                  {category.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </SettingsSectionBlock>
      <SettingsSectionFooter>
        <Button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          type="button"
        >
          {t('save_mapping')}
        </Button>
      </SettingsSectionFooter>

      <SettingItemTab
        layout="stacked"
        title={t('square_readiness_title')}
        description={t('square_readiness_description')}
      />
    </SettingsSection>
  );
}
