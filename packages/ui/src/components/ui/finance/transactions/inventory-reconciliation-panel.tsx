'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, RefreshCw, Unlink } from '@tuturuuu/icons';
import {
  bulkLinkInventoryFinanceEntries,
  bulkUnlinkInventoryFinanceEntries,
  getInventoryFinanceMappings,
  type InventoryFinanceEntryStatus,
  type InventoryFinanceProvider,
  listInventoryFinanceEntries,
  syncInventoryFinanceProvider,
} from '@tuturuuu/internal-api';
import {
  listTransactionCategories,
  listWallets,
} from '@tuturuuu/internal-api/finance';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatInventoryReconciliationAmount,
  InventoryReconciliationEntryRow,
  inventoryProviderTranslationKey,
} from './inventory-reconciliation-entry-row';

const ALL = 'all';
const NONE = 'none';
const providerValues: Array<InventoryFinanceProvider | typeof ALL> = [
  ALL,
  'polar',
  'square_pos',
  'square_terminal',
];

export function InventoryReconciliationPanel({
  defaultCurrency,
  wsId,
}: {
  defaultCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory-finance-reconciliation');
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<
    InventoryFinanceProvider | typeof ALL
  >(ALL);
  const [status, setStatus] = useState<InventoryFinanceEntryStatus>('pending');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [walletId, setWalletId] = useState(NONE);
  const [categoryId, setCategoryId] = useState(NONE);

  const reconciliationQuery = useQuery({
    queryKey: [
      'inventory-finance-reconciliation',
      wsId,
      provider,
      status,
      currency,
    ],
    queryFn: () =>
      listInventoryFinanceEntries(wsId, {
        currency: currency || undefined,
        limit: 100,
        provider: provider === ALL ? undefined : provider,
        status,
      }),
  });
  const mappingsQuery = useQuery({
    queryKey: ['inventory-finance-mappings', wsId],
    queryFn: () => getInventoryFinanceMappings(wsId),
  });
  const walletsQuery = useQuery({
    queryKey: ['workspace-wallets', wsId],
    queryFn: () => listWallets(wsId),
  });
  const categoriesQuery = useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: () => listTransactionCategories(wsId),
  });
  const entries = reconciliationQuery.data?.data ?? [];
  const selectedEntries = entries.filter((entry) =>
    selectedIds.includes(entry.id)
  );
  const selectedCurrencies = new Set(
    selectedEntries.map((entry) => entry.currency)
  );
  const compatibleWallets = (walletsQuery.data ?? []).filter(
    (wallet) =>
      wallet.id &&
      (selectedCurrencies.size !== 1 ||
        selectedCurrencies.has((wallet.currency ?? '').toUpperCase()))
  );

  const invalidate = async () => {
    setSelectedIds([]);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['inventory-finance-reconciliation', wsId],
      }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-wallets', wsId] }),
    ]);
  };
  const linkMutation = useMutation({
    mutationFn: () =>
      bulkLinkInventoryFinanceEntries(wsId, {
        categoryId: categoryId === NONE ? null : categoryId,
        entryIds: selectedIds,
        walletId,
      }),
    onSuccess: async () => {
      toast.success(t('bulk_link_success'));
      await invalidate();
    },
    onError: () => toast.error(t('bulk_action_error')),
  });
  const unlinkMutation = useMutation({
    mutationFn: () =>
      bulkUnlinkInventoryFinanceEntries(wsId, { entryIds: selectedIds }),
    onSuccess: async () => {
      toast.success(t('bulk_unlink_success'));
      await invalidate();
    },
    onError: () => toast.error(t('bulk_action_error')),
  });
  const applyDefaultsMutation = useMutation({
    mutationFn: async () => {
      const mappings = mappingsQuery.data?.mappings ?? [];
      const groups = new Map<
        string,
        { categoryId: string | null; entryIds: string[]; walletId: string }
      >();
      for (const entry of selectedEntries) {
        const mapping = mappings.find(
          (item) =>
            item.provider === entry.provider &&
            item.currency === entry.currency &&
            item.walletId
        );
        if (!mapping?.walletId) throw new Error('missing-mapping');
        const key = `${mapping.walletId}:${mapping.categoryId ?? ''}`;
        const group = groups.get(key) ?? {
          categoryId: mapping.categoryId,
          entryIds: [],
          walletId: mapping.walletId,
        };
        group.entryIds.push(entry.id);
        groups.set(key, group);
      }
      return Promise.all(
        [...groups.values()].map((group) =>
          bulkLinkInventoryFinanceEntries(wsId, group)
        )
      );
    },
    onSuccess: async () => {
      toast.success(t('apply_defaults_success'));
      await invalidate();
    },
    onError: () => toast.error(t('missing_mapping_error')),
  });
  const syncMutation = useMutation({
    mutationFn: async () => {
      const selectedProvider =
        provider === 'polar' ? 'polar' : provider === ALL ? null : 'square';
      const providers: ReadonlyArray<'polar' | 'square'> = selectedProvider
        ? [selectedProvider]
        : (['polar', 'square'] as const);
      return Promise.all(
        providers.map((item) =>
          syncInventoryFinanceProvider(wsId, {
            environment: 'production',
            limit: 100,
            provider: item,
          })
        )
      );
    },
    onSuccess: async () => {
      toast.success(t('sync_success'));
      await invalidate();
    },
    onError: () => toast.error(t('sync_error')),
  });

  const pending = reconciliationQuery.data?.summary.pending ?? [];
  const pendingLabel = useMemo(
    () =>
      pending.length
        ? pending
            .map(
              (item) =>
                `${item.count} · ${formatInventoryReconciliationAmount(item.amount, item.currency)}`
            )
            .join(' / ')
        : t('nothing_pending'),
    [pending, t]
  );
  const allSelected =
    entries.length > 0 &&
    entries.every((entry) => selectedIds.includes(entry.id));
  const isMutating =
    linkMutation.isPending ||
    unlinkMutation.isPending ||
    applyDefaultsMutation.isPending;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-dynamic-orange" />
          <div>
            <h2 className="font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
            <p className="mt-1 font-medium text-sm">{pendingLabel}</p>
          </div>
        </div>
        <Button
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            className={syncMutation.isPending ? 'animate-spin' : undefined}
          />
          {t('sync_provider_history')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b p-3">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as InventoryFinanceEntryStatus);
            setSelectedIds([]);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{t('view_needs_wallet')}</SelectItem>
            <SelectItem value="linked">{t('view_linked')}</SelectItem>
            <SelectItem value="error">{t('view_errors')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={provider}
          onValueChange={(value) => {
            setProvider(value as InventoryFinanceProvider | typeof ALL);
            setSelectedIds([]);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerValues.map((value) => (
              <SelectItem key={value} value={value}>
                {value === ALL
                  ? t('all_providers')
                  : t(inventoryProviderTranslationKey(value))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...new Set([defaultCurrency, 'USD', 'VND'])].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries.length > 0 && (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) =>
              setSelectedIds(
                checked === true ? entries.map((entry) => entry.id) : []
              )
            }
          />
          {t('select_all', { count: entries.length })}
        </div>
      )}
      <div>
        {entries.map((entry) => (
          <InventoryReconciliationEntryRow
            checked={selectedIds.includes(entry.id)}
            entry={entry}
            key={entry.id}
            onCheckedChange={(checked) =>
              setSelectedIds((current) =>
                checked
                  ? [...new Set([...current, entry.id])]
                  : current.filter((id) => id !== entry.id)
              )
            }
          />
        ))}
        {!reconciliationQuery.isLoading && entries.length === 0 && (
          <p className="p-8 text-center text-muted-foreground text-sm">
            {t('empty_view')}
          </p>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="sticky bottom-3 m-3 flex flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center">
          <Badge variant="secondary">
            {t('selected_count', { count: selectedIds.length })}
          </Badge>
          {status === 'linked' ? (
            <Button
              disabled={isMutating}
              onClick={() => unlinkMutation.mutate()}
              size="sm"
              variant="destructive"
            >
              <Unlink />
              {t('unlink')}
            </Button>
          ) : (
            <>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="min-w-48">
                  <SelectValue placeholder={t('assign_wallet')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem disabled value={NONE}>
                    {t('assign_wallet')}
                  </SelectItem>
                  {compatibleWallets.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id as string}>
                      {wallet.name} · {wallet.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="min-w-44">
                  <SelectValue placeholder={t('set_category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('uncategorized')}</SelectItem>
                  {(categoriesQuery.data ?? [])
                    .filter((category) => category.id)
                    .map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id as string}
                      >
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                disabled={
                  isMutating ||
                  walletId === NONE ||
                  selectedCurrencies.size !== 1
                }
                onClick={() => linkMutation.mutate()}
                size="sm"
              >
                <Link2 />
                {t('assign_or_move')}
              </Button>
              <Button
                disabled={isMutating}
                onClick={() => applyDefaultsMutation.mutate()}
                size="sm"
                variant="outline"
              >
                <RefreshCw />
                {t('apply_defaults')}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
