'use client';

import { useTranslations } from 'next-intl';

interface DriveResultSummaryProps {
  currentFileCount: number;
  currentFolderCount: number;
  currentPath: string;
  directoryLabel: string;
  query: string;
  showingCount: number;
  total: number;
}

export function DriveResultSummary({
  currentFileCount,
  currentFolderCount,
  currentPath,
  directoryLabel,
  query,
  showingCount,
  total,
}: DriveResultSummaryProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-dynamic-border/60 border-t pt-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/85">
        {t('results_summary', {
          from: showingCount === 0 ? 0 : 1,
          to: showingCount,
          total,
        })}
      </span>
      <span className="hidden text-muted-foreground/50 sm:inline">/</span>
      <span>{`${currentFolderCount} ${t('folder_count_label').toLowerCase()}`}</span>
      <span className="hidden text-muted-foreground/50 sm:inline">/</span>
      <span>{`${currentFileCount} ${t('file_count_label').toLowerCase()}`}</span>
      {query ? (
        <>
          <span className="hidden text-muted-foreground/50 sm:inline">/</span>
          <span className="truncate">
            {t('search')}: "{query}"
          </span>
        </>
      ) : null}
      {currentPath ? (
        <>
          <span className="hidden text-muted-foreground/50 sm:inline">/</span>
          <span className="truncate">{directoryLabel}</span>
        </>
      ) : null}
      <span className="sr-only">
        {t('results_hint', {
          folders: currentFolderCount,
          files: currentFileCount,
        })}
      </span>
    </div>
  );
}
