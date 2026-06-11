'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from '@tuturuuu/icons';
import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import {
  getInventorySale,
  updateInventorySale,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { EmptyRow, LoadingRows } from './operator-shell';

export function SaleDetailPanel({
  sales,
  wsId,
}: {
  sales: InventorySaleSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [saleId, setSaleId] = useState('');
  const [note, setNote] = useState('');
  const activeSaleId = saleId || sales[0]?.id || '';
  const sale = useQuery({
    enabled: Boolean(activeSaleId),
    queryFn: () => getInventorySale(wsId, activeSaleId),
    queryKey: ['inventory', wsId, 'sale', activeSaleId],
  });
  const currentNote = note || sale.data?.data.note || '';
  const mutation = useMutation({
    mutationFn: () =>
      updateInventorySale(wsId, activeSaleId, { note: currentNote }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sale'] });
    },
  });

  if (!sales.length) return <EmptyRow label={t('emptyResource')} />;

  return (
    <form
      className="grid gap-2 border-border border-t p-3 lg:grid-cols-[220px_1fr_auto]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => {
          setSaleId(event.target.value);
          setNote('');
        }}
        value={activeSaleId}
      >
        {sales.map((sale) => (
          <option key={sale.id} value={sale.id}>
            {sale.customer_name ?? sale.id}
          </option>
        ))}
      </select>
      {sale.isPending ? (
        <LoadingRows />
      ) : (
        <input
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('note')}
          value={currentNote}
        />
      )}
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
        disabled={!activeSaleId || mutation.isPending}
        type="submit"
      >
        <Save className="h-4 w-4" />
        {t('save')}
      </button>
    </form>
  );
}
