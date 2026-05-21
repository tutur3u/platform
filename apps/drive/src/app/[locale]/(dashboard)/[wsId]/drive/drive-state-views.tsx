'use client';

import { AlertTriangle, Folder, Loader2, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

interface DriveEmptyStateProps {
  hasSearch: boolean;
  hasPath: boolean;
  onResetSearch: () => void;
}

export function DriveLoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <Card className="overflow-hidden rounded-[28px] border-dynamic-border/80">
        <CardContent className="space-y-4 p-5">
          <Skeleton className="h-10 w-40 rounded-full" />
          <Skeleton className="h-16 w-full rounded-3xl" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-[28px] border-dynamic-border/80">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-8 w-36 rounded-full" />
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-3xl" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DriveErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Card className="rounded-[28px] border-dynamic-red/20 bg-dynamic-red/5">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dynamic-red/20 bg-background/80">
          <AlertTriangle className="h-6 w-6 text-dynamic-red" />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">{t('error_title')}</h2>
          <p className="max-w-xl text-muted-foreground text-sm">
            {t('error_description')}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onRetry}>
          <Loader2 className="mr-2 h-4 w-4" />
          {t('retry')}
        </Button>
      </CardContent>
    </Card>
  );
}

export function DriveEmptyState({
  hasSearch,
  hasPath,
  onResetSearch,
}: DriveEmptyStateProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Card className="rounded-[28px] border-dynamic-border/80 border-dashed bg-muted/20">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
        <div className="relative flex h-18 w-18 items-center justify-center rounded-[2rem] border border-dynamic-border bg-background shadow-sm">
          {hasSearch ? (
            <Search className="h-8 w-8 text-dynamic-blue" />
          ) : (
            <Folder className="h-8 w-8 text-dynamic-blue" />
          )}
          <div className="absolute -right-2 -bottom-2 rounded-full border border-dynamic-border bg-background px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            {hasSearch ? t('search') : t('folder')}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-xl">
            {hasSearch
              ? t('empty_search_title')
              : hasPath
                ? t('empty_folder_title')
                : t('empty_root_title')}
          </h2>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">
            {hasSearch
              ? t('empty_search_description')
              : hasPath
                ? t('empty_folder_description')
                : t('empty_root_description')}
          </p>
        </div>
        {hasSearch ? (
          <Button type="button" variant="outline" onClick={onResetSearch}>
            {t('clear_search')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
