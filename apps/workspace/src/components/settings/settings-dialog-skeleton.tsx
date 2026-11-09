'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
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
      className="settings-surface flex-col"
      data-testid="settings-dialog-skeleton"
      presentation="fullscreen"
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <div className="flex h-full min-h-0 items-start">
        <aside className="hidden h-full w-64 flex-col border-r bg-muted/30 md:flex">
          <div className="space-y-2 p-3 pb-0">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-4 overflow-hidden p-3">
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
          <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-0 md:py-10">
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-5 w-80 max-w-full" />
            </div>
            <SettingsSection>
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <SettingItemTab
                  description={<Skeleton className="h-4 w-64 max-w-full" />}
                  key={rowIndex}
                  layout="inline"
                  title={<Skeleton className="h-4 w-32" />}
                >
                  <Skeleton className="h-9 w-40" />
                </SettingItemTab>
              ))}
            </SettingsSection>
          </div>
        </main>
      </div>
    </DialogContent>
  );
}
