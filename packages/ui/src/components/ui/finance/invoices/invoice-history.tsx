'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, RotateCcw, Search } from '@tuturuuu/icons';
import {
  getInvoiceHistory,
  type InvoiceHistoryEntry,
  restoreInvoice,
} from '@tuturuuu/internal-api/finance';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FinanceNumbersVisibilityToggle } from '../shared/numbers-visibility-toggle';
import {
  DEFAULT_HISTORY_FILTERS,
  InvoiceHistoryFilterBar,
} from './invoice-history-filters';
import { InvoiceHistoryPagination } from './invoice-history-pagination';
import { InvoiceHistoryRow } from './invoice-history-row';
import { invalidateInvoiceMutationQueries } from './query-invalidation';

export function InvoiceHistory({
  wsId,
  canRestore,
}: {
  wsId: string;
  canRestore: boolean;
}) {
  const t = useTranslations('ws-invoices');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(DEFAULT_HISTORY_FILTERS);
  const [deletedOnly, setDeletedOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selected, setSelected] = useState<InvoiceHistoryEntry | null>(null);
  const query = useQuery({
    queryKey: [
      'invoice-history',
      wsId,
      deletedOnly,
      page,
      pageSize,
      submittedSearch,
      filters,
    ],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === wsId ? previous : undefined,
    staleTime: 30_000,
    retry: 1,
    queryFn: () =>
      getInvoiceHistory(wsId, {
        q: submittedSearch,
        entity: filters.entity === 'all' ? undefined : filters.entity,
        action: filters.action === 'all' ? undefined : filters.action,
        from: filters.from
          ? new Date(`${filters.from}T00:00:00`).toISOString()
          : undefined,
        to: filters.to
          ? new Date(`${filters.to}T23:59:59.999`).toISOString()
          : undefined,
        sort: filters.sort,
        deletedOnly,
        offset: page * pageSize,
        limit: pageSize,
      }),
  });
  const restore = useMutation({
    mutationFn: (invoiceId: string) => restoreInvoice(wsId, invoiceId),
    onSuccess: async () => {
      setSelected(null);
      toast.success(t('recovery_success'));
      await invalidateInvoiceMutationQueries(queryClient, wsId);
      router.refresh();
    },
    onError: () => toast.error(t('recovery_error')),
  });

  const resetFilters = () => {
    setFilters(DEFAULT_HISTORY_FILTERS);
    setSearch('');
    setSubmittedSearch('');
    setPage(0);
  };
  const hasFilters = !!(
    submittedSearch ||
    filters.entity !== 'all' ||
    filters.action !== 'all' ||
    filters.from ||
    filters.to ||
    filters.sort !== 'desc'
  );

  const pagination = (
    <InvoiceHistoryPagination
      page={page}
      pageSize={pageSize}
      hasMore={!!query.data?.hasMore}
      busy={query.isFetching}
      failed={query.isError}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(0);
      }}
    />
  );

  return (
    <section className="space-y-4" aria-label={t('activity')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="flex items-center gap-2 font-semibold">
            <History className="size-4" />
            {t('activity')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('activity_description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FinanceNumbersVisibilityToggle />
          <Button
            variant="outline"
            size="icon"
            aria-label={t('activity_refresh')}
            title={t('activity_refresh')}
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant={deletedOnly ? 'secondary' : 'outline'}
            aria-pressed={deletedOnly}
            onClick={() => {
              setDeletedOnly(!deletedOnly);
              if (!deletedOnly)
                setFilters({ ...filters, entity: 'all', action: 'all' });
              setPage(0);
            }}
          >
            {t(deletedOnly ? 'activity_show_all' : 'deleted_invoices')}
          </Button>
        </div>
      </div>
      {deletedOnly && !query.isError && !!query.data?.data.length && (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="font-medium text-sm">{t('recovery_review_title')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('recovery_review_description')}
          </p>
        </div>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedSearch(search.trim());
          setPage(0);
        }}
      >
        <Input
          className="min-w-48 flex-1"
          value={search}
          maxLength={120}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('activity_search')}
          placeholder={t('activity_search')}
        />
        <Button variant="outline" type="submit">
          <Search className="size-4" aria-hidden="true" />
          {t('activity_search_action')}
        </Button>
        {hasFilters && (
          <Button type="button" variant="ghost" onClick={resetFilters}>
            {t('activity_clear_filters')}
          </Button>
        )}
      </form>
      <InvoiceHistoryFilterBar
        value={filters}
        onChange={(next) => {
          setFilters(next);
          if (next.entity !== filters.entity || next.action !== filters.action)
            setDeletedOnly(false);
          setPage(0);
        }}
      />
      {pagination}
      <div
        className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs"
        role="status"
        aria-live="polite"
      >
        <span>{t('activity_timezone', { timeZone })}</span>
        {query.isFetching && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {t('activity_loading')}
          </span>
        )}
      </div>
      {query.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="mb-2 h-32 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="space-y-3 rounded-lg border p-6">
          <p>{t('activity_error')}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            {t('activity_retry')}
          </Button>
        </div>
      ) : !query.data.data.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          <History
            className="mx-auto mb-3 size-8 opacity-50"
            aria-hidden="true"
          />
          <p>{t('activity_empty')}</p>
          {hasFilters && (
            <Button variant="link" onClick={resetFilters}>
              {t('activity_clear_filters')}
            </Button>
          )}
        </div>
      ) : (
        <ol
          className={`divide-y rounded-lg border transition-opacity ${query.isPlaceholderData ? 'opacity-60' : ''}`}
          aria-busy={query.isFetching}
        >
          {query.data.data.map((entry) => (
            <InvoiceHistoryRow
              key={entry.id}
              entry={entry}
              timeZone={timeZone}
              canRestore={canRestore}
              restoring={restore.isPending || query.isPlaceholderData}
              onRestore={() => setSelected(entry)}
            />
          ))}
        </ol>
      )}
      {pagination}
      <AlertDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !restore.isPending) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restore_invoice')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('recovery_confirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all font-mono text-xs">{selected?.invoice_id}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>
              {t('recovery_cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (selected) restore.mutate(selected.invoice_id);
              }}
            >
              {t(restore.isPending ? 'recovery_restoring' : 'restore_invoice')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
