'use client';

import { Download } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { Dialog, DialogContent, DialogTrigger } from '@tuturuuu/ui/dialog';
import { DateRangeFilterWrapper } from '@tuturuuu/ui/finance/shared/date-range-filter-wrapper';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import ExportDialogContent from './export-dialog-content';
import { UserFilterWrapper } from './user-filter-wrapper';
import { WalletFilterWrapper } from './wallet-filter-wrapper';

interface InvoicesToolbarProps {
  wsId: string;
  canExport?: boolean;
}

export function InvoicesToolbar({ wsId, canExport }: InvoicesToolbarProps) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSearch = (query: string) => {
    const params = new URLSearchParams(searchParams);
    if (query) {
      params.set('q', query);
      params.set('page', '1');
    } else {
      params.delete('q');
      params.delete('page');
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row">
      <div className="grid w-full flex-1 flex-wrap items-center gap-2 md:flex">
        <SearchBar
          t={t}
          defaultValue={searchParams.get('q') || ''}
          onSearch={handleSearch}
          className="col-span-full w-full bg-background md:col-span-1 md:max-w-xs"
        />
        <Suspense fallback={<Skeleton className="h-8 w-32" />}>
          <UserFilterWrapper wsId={wsId} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-8 w-32" />}>
          <WalletFilterWrapper wsId={wsId} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-8 w-32" />}>
          <DateRangeFilterWrapper />
        </Suspense>
      </div>

      <div className="flex w-full gap-2 md:w-auto">
        {/* Export button */}
        {canExport && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full md:w-fit"
              >
                <Download className="mr-2 h-4 w-4" />
                {t('common.export')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <ExportDialogContent
                wsId={wsId}
                exportType="invoices"
                searchParams={{
                  q: searchParams.get('q') || undefined,
                  page: searchParams.get('page') || undefined,
                  pageSize: searchParams.get('pageSize') || undefined,
                  start: searchParams.get('start') || undefined,
                  end: searchParams.get('end') || undefined,
                  userIds: searchParams.getAll('userIds'),
                  walletIds: searchParams.getAll('walletIds'),
                  walletId: searchParams.get('walletId') || undefined,
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
