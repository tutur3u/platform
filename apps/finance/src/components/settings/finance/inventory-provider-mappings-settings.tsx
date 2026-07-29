'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, ShieldCheck } from '@tuturuuu/icons';
import {
  getInventoryFinanceMappings,
  type InventoryFinanceProvider,
  putInventoryFinanceMappings,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
const providers: InventoryFinanceProvider[] = [
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
  const [provider, setProvider] = useState<InventoryFinanceProvider>('polar');
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
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 text-dynamic-blue" />
        <div>
          <h4 className="font-semibold text-base">{t('mapping_title')}</h4>
          <p className="text-muted-foreground text-sm">
            {t('mapping_description')}
          </p>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        {(data?.mappings ?? []).map((mapping) => (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
            key={`${mapping.provider}:${mapping.currency}`}
          >
            <Badge variant="outline">{t(`provider_${mapping.provider}`)}</Badge>
            <Badge variant="secondary">{mapping.currency}</Badge>
            <span>{mapping.wallet?.name ?? t('needs_wallet')}</span>
            <span className="text-muted-foreground">
              {mapping.category?.name ?? t('uncategorized')}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select
          value={provider}
          onValueChange={(value) =>
            setProvider(value as InventoryFinanceProvider)
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
      </div>
      <Button
        className="mt-3"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        type="button"
      >
        {t('save_mapping')}
      </Button>

      <div className="mt-5 flex gap-3 rounded-xl border border-dynamic-orange/30 bg-dynamic-orange/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-dynamic-orange" />
        <div>
          <p className="font-medium text-sm">{t('square_readiness_title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('square_readiness_description')}
          </p>
        </div>
      </div>
    </section>
  );
}
