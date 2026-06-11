'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, RotateCcw, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryAuditLogSummary,
  InventoryBundle,
  InventoryCheckoutSession,
  InventorySaleSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import {
  deleteInventoryBundle,
  deleteInventorySale,
  deleteInventoryStorefront,
  releaseInventoryCheckout,
  updateInventoryBundle,
  updateInventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { STOREFRONT_APP_URL } from '@/constants/common';
import { currency } from './operator-format';
import { EmptyRow } from './operator-shell';

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-dynamic-blue/25 bg-dynamic-blue/10 px-2 font-medium text-dynamic-blue text-xs">
      {value}
    </span>
  );
}

export function SimpleRows({
  rows,
  type,
  wsId,
}: {
  rows: Array<
    | InventoryAuditLogSummary
    | InventoryBundle
    | InventoryCheckoutSession
    | InventorySaleSummary
    | InventoryStorefront
  >;
  type: 'audits' | 'bundles' | 'checkouts' | 'sales' | 'storefronts';
  wsId?: string;
}) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const actionText = useTranslations('inventory.operator.forms');
  const invalidate = () => {
    if (!wsId) return;
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
  };
  const archiveStorefront = useMutation({
    mutationFn: (row: InventoryStorefront) =>
      updateInventoryStorefront(wsId ?? '', row.id, { status: 'archived' }),
    onError: () => toast.error(actionText('saveError')),
    onSuccess: () => {
      toast.success(actionText('saveSuccess'));
      invalidate();
    },
  });
  const deleteStorefront = useMutation({
    mutationFn: (row: InventoryStorefront) =>
      deleteInventoryStorefront(wsId ?? '', row.id),
    onError: () => toast.error(actionText('deleteError')),
    onSuccess: () => {
      toast.success(actionText('deleteSuccess'));
      invalidate();
    },
  });
  const archiveBundle = useMutation({
    mutationFn: (row: InventoryBundle) =>
      updateInventoryBundle(wsId ?? '', row.id, { status: 'archived' }),
    onError: () => toast.error(actionText('saveError')),
    onSuccess: () => {
      toast.success(actionText('saveSuccess'));
      invalidate();
    },
  });
  const deleteBundle = useMutation({
    mutationFn: (row: InventoryBundle) =>
      deleteInventoryBundle(wsId ?? '', row.id),
    onError: () => toast.error(actionText('deleteError')),
    onSuccess: () => {
      toast.success(actionText('deleteSuccess'));
      invalidate();
    },
  });
  const releaseCheckout = useMutation({
    mutationFn: (row: InventoryCheckoutSession) =>
      releaseInventoryCheckout(wsId ?? '', row.id),
    onError: () => toast.error(actionText('saveError')),
    onSuccess: () => {
      toast.success(actionText('saveSuccess'));
      invalidate();
    },
  });
  const deleteSale = useMutation({
    mutationFn: (row: InventorySaleSummary) =>
      deleteInventorySale(wsId ?? '', row.id),
    onError: () => toast.error(actionText('deleteError')),
    onSuccess: () => {
      toast.success(actionText('deleteSuccess'));
      invalidate();
    },
  });

  if (rows.length === 0) return <EmptyRow label={t('empty')} />;

  return (
    <div className="divide-y divide-border">
      {rows.map((row) => {
        const anyRow = row as Record<string, unknown>;
        const title = String(
          anyRow.name ??
            anyRow.customerName ??
            anyRow.customer_name ??
            anyRow.summary ??
            anyRow.id
        );
        const value =
          type === 'sales'
            ? currency(Number(anyRow.paid_amount ?? 0))
            : String(anyRow.status ?? anyRow.event_kind ?? '');

        return (
          <div
            className="grid gap-2 p-3 text-sm lg:grid-cols-[1fr_auto_auto_auto] lg:items-center"
            key={String(anyRow.id)}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{title}</p>
              <p className="truncate text-muted-foreground text-xs">
                {String(
                  anyRow.slug ??
                    anyRow.publicToken ??
                    anyRow.created_at ??
                    anyRow.id
                )}
              </p>
            </div>
            {value ? <StatusBadge value={value} /> : <span />}
            {type === 'storefronts' && 'slug' in anyRow ? (
              <a
                className="text-dynamic-blue text-xs"
                href={`${STOREFRONT_APP_URL}/store/${String(anyRow.slug)}`}
              >
                {t('openStore')}
              </a>
            ) : null}
            {wsId && type === 'storefronts' ? (
              <div className="flex gap-1">
                <button
                  className="inline-flex h-8 items-center rounded-md border border-border px-2"
                  onClick={() =>
                    archiveStorefront.mutate(row as InventoryStorefront)
                  }
                  type="button"
                >
                  <Archive className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex h-8 items-center rounded-md border border-dynamic-red/30 px-2 text-dynamic-red"
                  onClick={() =>
                    deleteStorefront.mutate(row as InventoryStorefront)
                  }
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {wsId && type === 'bundles' ? (
              <div className="flex gap-1">
                <button
                  className="inline-flex h-8 items-center rounded-md border border-border px-2"
                  onClick={() => archiveBundle.mutate(row as InventoryBundle)}
                  type="button"
                >
                  <Archive className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex h-8 items-center rounded-md border border-dynamic-red/30 px-2 text-dynamic-red"
                  onClick={() => deleteBundle.mutate(row as InventoryBundle)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {wsId && type === 'checkouts' ? (
              <button
                className="inline-flex h-8 items-center rounded-md border border-border px-2 disabled:opacity-50"
                disabled={String(anyRow.status) === 'completed'}
                onClick={() =>
                  releaseCheckout.mutate(row as InventoryCheckoutSession)
                }
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            ) : null}
            {wsId && type === 'sales' ? (
              <button
                className="inline-flex h-8 items-center rounded-md border border-dynamic-red/30 px-2 text-dynamic-red"
                onClick={() => deleteSale.mutate(row as InventorySaleSummary)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
