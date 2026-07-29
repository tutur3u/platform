'use client';

import { useQuery } from '@tanstack/react-query';
import { listInventoryFinanceEntries } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function InventoryWalletContribution({
  currency,
  walletId,
  wsId,
}: {
  currency: string;
  walletId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory-finance-reconciliation');
  const [provider, setProvider] = useState('all');
  const { data, isLoading } = useQuery({
    queryKey: ['inventory-wallet-contribution', wsId, walletId, provider],
    queryFn: () =>
      listInventoryFinanceEntries(wsId, {
        currency,
        limit: 1,
        provider:
          provider === 'all'
            ? undefined
            : (provider as 'polar' | 'square_pos' | 'square_terminal'),
        status: 'linked',
        walletId,
      }),
  });
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  const values =
    provider === 'all'
      ? data?.summary.netSales
      : data?.summary.providers.find((item) => item.provider === provider)
          ?.netSales;
  const net = values?.find((item) => item.currency === currency)?.amount ?? 0;

  return (
    <Card className="my-4 flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{t('wallet_contribution_title')}</h3>
          <Badge variant="secondary">{t('linked_only')}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('wallet_contribution_description')}
        </p>
        <p className="mt-2 font-bold text-2xl">
          {new Intl.NumberFormat(getCurrencyLocale(currency), {
            currency,
            style: 'currency',
          }).format(net)}
        </p>
      </div>
      <Select value={provider} onValueChange={setProvider}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all_providers')}</SelectItem>
          <SelectItem value="polar">{t('provider_polar')}</SelectItem>
          <SelectItem value="square_pos">{t('provider_square_pos')}</SelectItem>
          <SelectItem value="square_terminal">
            {t('provider_square_terminal')}
          </SelectItem>
        </SelectContent>
      </Select>
    </Card>
  );
}
