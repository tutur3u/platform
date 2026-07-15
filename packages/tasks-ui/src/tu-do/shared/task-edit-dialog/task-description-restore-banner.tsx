'use client';

import { AlertTriangle, History, Loader2, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { RecoverableTaskDescriptionVersion } from './description-versions';

interface TaskDescriptionRestoreBannerProps {
  latestVersion: RecoverableTaskDescriptionVersion | null;
  versionCount: number;
  isRestoring: boolean;
  onRestoreLatest: () => void;
  onViewVersions: () => void;
  t: (
    key: string,
    options?: { count?: number; defaultValue?: string }
  ) => string;
}

export function TaskDescriptionRestoreBanner({
  latestVersion,
  versionCount,
  isRestoring,
  onRestoreLatest,
  onViewVersions,
  t,
}: TaskDescriptionRestoreBannerProps) {
  if (!latestVersion) return null;

  return (
    <div className="mx-4 mb-3 rounded-md border border-dynamic-orange/30 bg-dynamic-orange/5 p-3 md:mx-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-sm">
              {t('description_restore_banner_title', {
                defaultValue: 'A tracked description version is available',
              })}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('description_restore_banner_description', {
                count: versionCount,
                defaultValue:
                  'Current content differs from the latest tracked version. Restore it or compare all tracked versions.',
              })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs"
            disabled={isRestoring}
            onClick={onRestoreLatest}
            size="sm"
            type="button"
            variant="default"
          >
            {isRestoring ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {t('restore_latest_tracked', {
              defaultValue: 'Restore latest tracked',
            })}
          </Button>
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={onViewVersions}
            size="sm"
            type="button"
            variant="outline"
          >
            <History className="h-3.5 w-3.5" />
            {t('view_description_versions', {
              defaultValue: 'View versions',
            })}
          </Button>
        </div>
      </div>
    </div>
  );
}
