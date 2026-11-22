'use client';

import { CloudUpload, TriangleAlert } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { DriveAccess } from './drive-browser-state';
import { DriveBrowserView } from './drive-browser-view';
import { DriveExplorerDialogs } from './drive-explorer-dialogs';
import { DriveFilterBar } from './drive-filter-bar';
import { DriveHeader } from './drive-header';
import { DriveLoadMore } from './drive-load-more';
import { DriveMobileNew } from './drive-mobile-new';
import { DriveSelectionBar } from './drive-selection-bar';
import { useDriveQuota } from './drive-storage-card';
import { DriveUploadsPanel } from './drive-uploads-panel';
import { getSelectionKey } from './drive-selection';
import { useDriveDropTarget } from './use-drive-drop-target';
import { useDriveExplorerController } from './use-drive-explorer-controller';

interface DriveExplorerClientProps {
  access?: DriveAccess;
  wsId: string;
}

export default function DriveExplorerClient({
  access = 'manage',
  wsId,
}: DriveExplorerClientProps) {
  const t = useTranslations('drive');
  const drive = useDriveExplorerController(wsId, access);
  const quota = useDriveQuota(wsId);
  const { handlers, state: dropState } = useDriveDropTarget({
    disabled: !drive.canManage,
    onDrop: drive.uploadFiles,
  });
  const { browserState, directoryQuery, searchState, selection } = drive;
  const searching = Boolean(searchState.q.trim() || searchState.type);
  const quotaTone = quota.state.kind === 'ready' ? quota.state.tone : 'normal';

  return (
    <div
      className="relative flex min-h-[calc(100dvh-8rem)] flex-col gap-4 pb-24"
      {...handlers}
    >
      <DriveHeader
        canManage={drive.canManage}
        onNavigate={drive.navigate}
        onNewFolder={() => drive.setDialog({ kind: 'new-folder' })}
        onQueryChange={(q) => drive.update({ q: q || null })}
        onUpload={drive.openFilePicker}
        path={drive.currentPath}
        query={searchState.q}
      />
      {browserState.kind === 'denied' ? null : (
        <DriveFilterBar onChange={drive.update} searchState={searchState} />
      )}
      {searching && browserState.kind === 'ready' ? (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {t('search.scope', { folder: drive.folderLabel })}
          {searchState.type && drive.hasMore
            ? ` ${t('search.loaded_only', { count: drive.loadedCount })}`
            : null}
        </p>
      ) : null}
      {quotaTone === 'normal' || !drive.canManage ? null : (
        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
            quotaTone === 'critical'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
          )}
          role="status"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {quotaTone === 'critical'
            ? t('storage.full_banner')
            : t('storage.almost_full_banner')}
        </div>
      )}
      <DriveBrowserView
        actions={drive.actions}
        isSelected={(item) =>
          selection.selectedKeys.includes(
            getSelectionKey(drive.currentPath, item)
          )
        }
        onClearFilters={() => drive.update({ q: null, type: null })}
        onNavigate={drive.openFolder}
        onRetry={() => void directoryQuery.refetch()}
        onSelectAll={selection.handleSelectAllVisible}
        onToggle={selection.toggleSelectedItem}
        onUpload={drive.openFilePicker}
        path={drive.currentPath}
        state={browserState}
        view={searchState.view}
        wsId={wsId}
      />
      {browserState.kind === 'ready' && drive.hasMore ? (
        <DriveLoadMore
          isLoading={directoryQuery.isFetchingNextPage}
          loaded={drive.loadedCount}
          onLoadMore={() => {
            if (!directoryQuery.isFetchingNextPage)
              void directoryQuery.fetchNextPage();
          }}
          total={directoryQuery.data?.total ?? drive.loadedCount}
        />
      ) : null}
      {dropState.kind === 'over' ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-3xl border-2 border-ring border-dashed bg-background/80">
          <span className="flex items-center gap-2 font-bold text-lg">
            <CloudUpload aria-hidden className="size-6" />
            {t('uploads.drop_to', { folder: drive.folderLabel })}
          </span>
        </div>
      ) : null}
      <input
        aria-hidden
        className="hidden"
        multiple
        onChange={(event) => {
          if (event.target.files) drive.uploadFiles(event.target.files);
          event.target.value = '';
        }}
        ref={drive.fileInput}
        tabIndex={-1}
        type="file"
      />
      <DriveSelectionBar
        actions={drive.actions}
        onClear={() => selection.setSelectedKeys([])}
        selected={selection.selectedItems}
      />
      <DriveUploadsPanel uploads={drive.uploads} />
      {drive.canManage && selection.selectedItems.length === 0 ? (
        <DriveMobileNew
          folderLabel={drive.folderLabel}
          onNewFolder={() => drive.setDialog({ kind: 'new-folder' })}
          onUpload={drive.openFilePicker}
        />
      ) : null}
      <DriveExplorerDialogs drive={drive} wsId={wsId} />
    </div>
  );
}
