'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { DriveViewMode } from './search-params';

export function DriveLoadingState({ view }: { view: DriveViewMode }) {
  const t = useTranslations('drive');

  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <span className="sr-only">{t('states.loading')}</span>
      {view === 'grid' ? (
        <>
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))]">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="h-16 rounded-2xl" key={index} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-12" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] md:gap-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton className="aspect-[4/3.9] rounded-2xl" key={index} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-px overflow-hidden rounded-2xl border border-border bg-card">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="flex h-14 items-center gap-3 px-3" key={index}>
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
