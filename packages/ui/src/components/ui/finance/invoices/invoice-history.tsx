'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from '@tuturuuu/icons';
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
import {
  DEFAULT_HISTORY_FILTERS,
  InvoiceHistoryFilterBar,
} from './invoice-history-filters';
import { InvoiceHistoryRow } from './invoice-history-row';
import { invalidateInvoiceMutationQueries } from './query-invalidation';

const PAGE_SIZE = 25;

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
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selected, setSelected] = useState<InvoiceHistoryEntry | null>(null);
  const query = useQuery({
    queryKey: [
      'invoice-history',
      wsId,
      deletedOnly,
      page,
      submittedSearch,
      filters,
    ],
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
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
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
        <Button
          variant={deletedOnly ? 'secondary' : 'outline'}
          aria-pressed={deletedOnly}
          onClick={() => {
            setDeletedOnly(!deletedOnly);
            setFilters(DEFAULT_HISTORY_FILTERS);
            setPage(0);
          }}
        >
          {t(deletedOnly ? 'activity_show_all' : 'deleted_invoices')}
        </Button>
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
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedSearch(search.trim());
          setPage(0);
        }}
      >
        <Input
          value={search}
          maxLength={120}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('activity_search')}
          placeholder={t('activity_search')}
        />
        <Button variant="outline" type="submit">
          {t('activity_search_action')}
        </Button>
      </form>
      <InvoiceHistoryFilterBar
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setDeletedOnly(false);
          setPage(0);
        }}
      />
      {query.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          <Skeleton className="h-48 w-full" />
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
          {t('activity_empty')}
        </div>
      ) : (
        <ol className="divide-y rounded-lg border">
          {query.data.data.map((entry) => (
            <InvoiceHistoryRow
              key={entry.id}
              entry={entry}
              canRestore={canRestore}
              restoring={restore.isPending}
              onRestore={() => setSelected(entry)}
            />
          ))}
        </ol>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          {t('activity_previous')}
        </Button>
        <span className="text-muted-foreground text-sm">{page + 1}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={
            query.isFetching ||
            query.isError ||
            (query.data?.data.length ?? 0) < PAGE_SIZE
          }
          onClick={() => setPage(page + 1)}
        >
          {t('activity_next')}
        </Button>
      </div>
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
