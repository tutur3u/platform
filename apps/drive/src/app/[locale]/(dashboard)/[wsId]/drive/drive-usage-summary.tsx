'use client';

import { HardDrive, Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  FileMetric,
  getUsageStateLabelKey,
  getUsageTone,
} from './drive-usage-summary-utils';
import { WorkspaceStorageExportLinksButton } from './export-links-dialog';
import NewActions from './new-actions';

interface DriveUsageSummaryProps {
  currentPath: string;
  directoryLabel: string;
  fileCount: number;
  isExpanded: boolean;
  isSyncing: boolean;
  largestFile: { size: number } | null | undefined;
  largestFileName: string;
  onRefresh: () => void | Promise<void>;
  setIsExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  smallestFile: { size: number } | null | undefined;
  smallestFileName: string;
  storageLimit: number;
  totalSize: number;
  usagePercentage: number;
  wsId: string;
}

export function DriveUsageSummary({
  currentPath,
  directoryLabel,
  fileCount,
  isExpanded,
  isSyncing,
  largestFile,
  largestFileName,
  onRefresh,
  setIsExpanded,
  smallestFile,
  smallestFileName,
  storageLimit,
  totalSize,
  usagePercentage,
  wsId,
}: DriveUsageSummaryProps) {
  const t = useTranslations('ws-storage-objects');
  const usageTone = getUsageTone(usagePercentage);

  return (
    <Card
      className={`overflow-hidden rounded-[32px] border-dynamic-border/80 bg-linear-to-br ${usageTone.card}`}
    >
      <CardContent className="relative px-6 py-6 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_58%)] lg:block" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:items-start">
          <div className="space-y-5">
            <Badge className="border-dynamic-border bg-background/70 text-foreground hover:bg-background/70">
              <HardDrive className="mr-2 h-4 w-4 text-dynamic-blue" />
              {t('workspace_drive_badge')}
            </Badge>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-semibold text-3xl tracking-tight">
                {t('name')}
              </h1>
              <Badge className={usageTone.badge}>
                {t(getUsageStateLabelKey(usageTone.label))}
              </Badge>
              {isSyncing ? (
                <Badge className="border-dynamic-border bg-background/70 text-foreground hover:bg-background/70">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {t('syncing')}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {currentPath ? (
                <WorkspaceStorageExportLinksButton
                  wsId={wsId}
                  folderPath={currentPath}
                  folderName={directoryLabel}
                />
              ) : null}
              <NewActions
                wsId={wsId}
                path={currentPath || undefined}
                onComplete={onRefresh}
              />
            </div>
          </div>

          <Card className="rounded-[28px] border-dynamic-border/80 bg-background/85 shadow-sm backdrop-blur">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{t('storage_health')}</p>
                    <Badge className={usageTone.badge}>
                      {usagePercentage.toFixed(2)}%
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    <span>
                      {formatBytes(totalSize)} / {formatBytes(storageLimit)}
                    </span>
                    <span>
                      {t('total_files')}: {fileCount}
                    </span>
                    <span className="truncate">
                      {t('focus_directory')}: {directoryLabel}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  aria-expanded={isExpanded}
                  onClick={() => setIsExpanded((current) => !current)}
                >
                  {isExpanded ? t('summary_collapse') : t('summary_expand')}
                </Button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${usageTone.bar}`}
                  style={{ width: `${Math.min(100, usagePercentage)}%` }}
                />
              </div>
              {isExpanded ? (
                <>
                  <Separator />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <FileMetric
                      label={t('largest_file')}
                      name={largestFileName}
                      size={largestFile?.size}
                    />
                    <FileMetric
                      label={t('smallest_file')}
                      name={smallestFileName}
                      size={smallestFile?.size}
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
