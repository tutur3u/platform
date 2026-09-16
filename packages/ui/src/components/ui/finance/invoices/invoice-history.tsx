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
  const [deletedOnly, setDeletedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selected, setSelected] = useState<InvoiceHistoryEntry | null>(null);
  const query = useQuery({
    queryKey: ['invoice-history', wsId, deletedOnly, page, submittedSearch],
    queryFn: () =>
      getInvoiceHistory(wsId, {
        q: submittedSearch,
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
            setPage(0);
          }}
        >
          {t('deleted_invoices')}
        </Button>
      </div>
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
