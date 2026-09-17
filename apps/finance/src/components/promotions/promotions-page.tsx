'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgePercent,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from '@tuturuuu/icons';
import { listFinancePromotions } from '@tuturuuu/internal-api/finance';
import { deleteInventoryPromotion } from '@tuturuuu/internal-api/inventory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { PromotionForm } from '@tuturuuu/ui/finance/invoices/promotion-form';
import { invalidateInvoiceMutationQueries } from '@tuturuuu/ui/finance/invoices/query-invalidation';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '@tuturuuu/ui/finance/shared/charts/use-finance-confidential-visibility';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  wsId: string;
  currency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function PromotionsPage({
  wsId,
  currency,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const t = useTranslations('finance-promotions');
  const common = useTranslations('common');
  const locale = useLocale();
  const client = useQueryClient();
  const { isConfidential } = useFinanceConfidentialVisibility();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductPromotion | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProductPromotion | null>(null);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['promotions', wsId, 'management', query, page],
    queryFn: () =>
      listFinancePromotions(wsId, { q: query, page, pageSize: 20 }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteInventoryPromotion(wsId, id),
    onSuccess: async () => {
      setDeleting(null);
      if (data?.data.length === 1 && page > 1) setPage(page - 1);
      await invalidateInvoiceMutationQueries(client, wsId);
      toast.success(t('deleted'));
    },
    onError: () => toast.error(t('delete-error')),
  });
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / 20));
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
            <BadgePercent className="size-6" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            {t('create')}
          </Button>
        )}
      </header>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex w-full max-w-md items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="promotion-search">{t('search')}</Label>
            <Input
              id="promotion-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search-placeholder')}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            aria-label={t('search')}
            title={t('search')}
          >
            <Search className="size-4" />
          </Button>
          {query && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('');
                setQuery('');
                setPage(1);
              }}
            >
              {common('clear')}
            </Button>
          )}
        </form>
        <Button
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={isFetching ? 'size-4 animate-spin' : 'size-4'}
          />
          {common('refresh')}
        </Button>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 p-6 text-sm"
        >
          {t('load-error')}
        </div>
      ) : isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : data?.data.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <BadgePercent className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="font-medium">
            {query ? t('no-results') : t('empty')}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {query ? t('try-search') : t('empty-description')}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-1 divide-y">
            {data?.data.map((promotion) => {
              const used = promotion.current_uses ?? 0;
              const exhausted =
                promotion.max_uses != null && used >= promotion.max_uses;
              const referral = promotion.promo_type === 'REFERRAL';
              return (
                <div
                  key={promotion.id}
                  className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-muted/30 sm:p-5"
                >
                  <div className="flex min-w-0 flex-1 basis-full items-start gap-3 sm:basis-0">
                    <div className="rounded-lg bg-muted p-2.5 text-muted-foreground">
                      <BadgePercent className="size-5" />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words font-medium">
                          {promotion.name}
                        </h2>
                        <Badge variant="outline">
                          {referral
                            ? t('referral')
                            : exhausted
                              ? t('exhausted')
                              : t('available')}
                        </Badge>
                      </div>
                      <code className="inline-block rounded bg-muted px-2 py-0.5 text-xs">
                        {promotion.code}
                      </code>
                      {promotion.description && (
                        <p className="max-w-xl break-words text-muted-foreground text-sm">
                          {promotion.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="min-w-36 space-y-1 sm:text-right">
                    <p className="font-semibold text-lg tabular-nums">
                      {promotion.use_ratio
                        ? `${Number(promotion.value)}%`
                        : isConfidential
                          ? FINANCE_HIDDEN_AMOUNT
                          : new Intl.NumberFormat(locale, {
                              style: 'currency',
                              currency,
                              maximumFractionDigits: 2,
                            }).format(Number(promotion.value))}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {promotion.max_uses == null
                        ? t('unlimited-usage', { used })
                        : t('limited-usage', {
                            used,
                            limit: promotion.max_uses,
                          })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canUpdate && !referral && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={common('edit')}
                        aria-label={`${common('edit')} ${promotion.name}`}
                        onClick={() => setEditing(promotion)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canDelete && !referral && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={common('delete')}
                        aria-label={`${common('delete')} ${promotion.name}`}
                        onClick={() => setDeleting(promotion)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
          <span>{t('count', { count: data.count })}</span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage(page - 1)}
            >
              {common('previous')}
            </Button>
            <span className="tabular-nums">{t('page', { page, pages })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || isFetching}
              onClick={() => setPage(page + 1)}
            >
              {common('next')}
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? t('create') : t('edit')}
            </DialogTitle>
            <DialogDescription>{t('form-description')}</DialogDescription>
          </DialogHeader>
          {editing && (
            <PromotionForm
              key={editing === 'new' ? 'new' : editing.id}
              wsId={wsId}
              data={editing === 'new' ? undefined : editing}
              canCreateInventory={canCreate}
              canUpdateInventory={canUpdate}
              onFinish={() => setEditing(null)}
              onCancel={() => setEditing(null)}
              showCancelButton
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete-title')}</DialogTitle>
            <DialogDescription>
              {t('delete-description', { name: deleting?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setDeleting(null)}
            >
              {common('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting?.id) remove.mutate(deleting.id);
              }}
            >
              {remove.isPending ? common('processing') : common('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
