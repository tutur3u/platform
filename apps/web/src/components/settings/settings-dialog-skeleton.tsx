'use client';

import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

export function SettingsDialogFullscreenSkeleton() {
  const t = useTranslations();

  return (
    <DialogContent
      className="flex-col"
      data-testid="settings-dialog-skeleton"
      presentation="fullscreen"
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <div className="flex h-full min-h-0 items-start">
        <aside className="hidden h-full w-72 flex-col border-r bg-muted/30 md:flex">
          <div className="space-y-3 p-4 pb-0">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-6 overflow-hidden p-4">
            {Array.from({ length: 4 }).map((_, groupIndex) => (
              <div className="space-y-2" key={groupIndex}>
                <Skeleton className="h-4 w-24" />
                {Array.from({ length: 4 }).map((_, itemIndex) => (
                  <Skeleton className="h-9 w-full" key={itemIndex} />
                ))}
              </div>
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="border-b px-4 py-4 md:px-8">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 md:px-8">
            <div className="space-y-3">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-5 w-80 max-w-full" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-4">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <div className="rounded-lg border p-5">
                <div className="space-y-3">
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full md:col-span-2" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </DialogContent>
  );
}
