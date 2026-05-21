'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { DriveDeleteDialogs } from './drive-delete-dialogs';
import {
  DriveEmptyState,
  DriveErrorState,
  DriveGridView,
  DriveListView,
  DriveLoadingState,
} from './drive-explorer-views';
import { DriveToolbar } from './drive-toolbar';
import { DriveUsageSummary } from './drive-usage-summary';
import { FilePreviewDialog } from './file-preview-dialog';
import { RenameStorageObjectDialog } from './rename-storage-object-dialog';
import { useDriveExplorerController } from './use-drive-explorer-controller';

interface DriveExplorerClientProps {
  wsId: string;
}

export default function DriveExplorerClient({
  wsId,
}: DriveExplorerClientProps) {
  const t = useTranslations('ws-storage-objects');
  const commonT = useTranslations('common');
  const drive = useDriveExplorerController(wsId);

  return (
    <div className="space-y-6">
      <DriveUsageSummary
        currentPath={drive.currentPath}
        directoryLabel={drive.directoryLabel}
        fileCount={drive.analyticsQuery.data?.fileCount ?? 0}
        isExpanded={drive.isSummaryExpanded}
        isSyncing={
          drive.directoryQuery.isFetching || drive.analyticsQuery.isFetching
        }
        largestFile={drive.analyticsQuery.data?.largestFile}
        largestFileName={drive.largestFileName}
        onRefresh={drive.handleRefresh}
        setIsExpanded={drive.setIsSummaryExpanded}
        smallestFile={drive.analyticsQuery.data?.smallestFile}
        smallestFileName={drive.smallestFileName}
        storageLimit={drive.analyticsQuery.data?.storageLimit ?? 0}
        totalSize={drive.analyticsQuery.data?.totalSize ?? 0}
        usagePercentage={drive.analyticsQuery.data?.usagePercentage ?? 0}
        wsId={wsId}
      />

      <DriveToolbar
        currentFileCount={drive.currentFileCount}
        currentFolderCount={drive.currentFolderCount}
        currentPath={drive.currentPath}
        directoryLabel={drive.directoryLabel}
        isReady={
          !drive.directoryQuery.isPending && !drive.directoryQuery.isError
        }
        onClearSelection={() => drive.selection.setSelectedKeys([])}
        onDeleteSelection={() => drive.setBulkDeleteDialogOpen(true)}
        onNavigateToPath={drive.handleNavigateToPath}
        onNavigateUp={drive.handleNavigateUp}
        onRefresh={drive.handleRefresh}
        onSelectAllVisible={() => drive.selection.handleSelectAllVisible(true)}
        searchState={drive.searchState}
        selectedCount={drive.selection.selectedItems.length}
        showingCount={drive.showingCount}
        total={drive.total}
        updateSearchState={drive.updateSearchState}
      />

      {drive.directoryQuery.isPending && !drive.directoryQuery.data ? (
        <DriveLoadingState />
      ) : drive.directoryQuery.isError ? (
        <DriveErrorState onRetry={() => void drive.directoryQuery.refetch()} />
      ) : drive.analyticsQuery.isError ? (
        <DriveErrorState onRetry={() => void drive.analyticsQuery.refetch()} />
      ) : drive.items.length === 0 ? (
        <DriveEmptyState
          hasSearch={Boolean(drive.searchState.q)}
          hasPath={Boolean(drive.currentPath)}
          onResetSearch={() => drive.updateSearchState({ q: null })}
        />
      ) : (
        <div className="space-y-5">
          {drive.searchState.view === 'list' ? (
            <DriveListView
              allSelected={drive.selection.allVisibleSelected}
              wsId={wsId}
              items={drive.items}
              path={drive.currentPath}
              onNavigate={drive.handleNavigateIntoFolder}
              onPreview={(item) => drive.setSelectedItem(item ?? null)}
              onRequestRename={drive.setRenameTarget}
              onRequestDelete={drive.setDeleteTarget}
              onSelectAll={drive.selection.handleSelectAllVisible}
              onToggleSelection={drive.selection.toggleSelectedItem}
              onMutationSuccess={drive.handleRefresh}
              selectedKeys={drive.selection.selectedKeys}
            />
          ) : (
            <DriveGridView
              allSelected={drive.selection.allVisibleSelected}
              wsId={wsId}
              items={drive.items}
              path={drive.currentPath}
              onNavigate={drive.handleNavigateIntoFolder}
              onPreview={(item) => drive.setSelectedItem(item ?? null)}
              onRequestRename={drive.setRenameTarget}
              onRequestDelete={drive.setDeleteTarget}
              onSelectAll={drive.selection.handleSelectAllVisible}
              onToggleSelection={drive.selection.toggleSelectedItem}
              onMutationSuccess={drive.handleRefresh}
              selectedKeys={drive.selection.selectedKeys}
            />
          )}
          {drive.hasMoreResults ? (
            <Card className="rounded-[28px] border-dynamic-border/80">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-muted-foreground text-sm">
                  {t('loaded_summary', {
                    current: drive.showingCount,
                    total: drive.total,
                  })}
                </div>
                <Button
                  type="button"
                  className="rounded-2xl"
                  disabled={drive.directoryQuery.isFetchingNextPage}
                  onClick={() => void drive.directoryQuery.fetchNextPage()}
                >
                  {drive.directoryQuery.isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('loading_more')}
                    </>
                  ) : (
                    commonT('load_more')
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <FilePreviewDialog
        wsId={wsId}
        path={drive.currentPath}
        file={drive.selectedItem}
        open={!!drive.selectedItem}
        onOpenChange={(open) => {
          if (!open) drive.setSelectedItem(null);
        }}
      />
      <RenameStorageObjectDialog
        wsId={wsId}
        path={drive.currentPath || undefined}
        storageObject={drive.renameTarget}
        open={!!drive.renameTarget}
        onOpenChange={(open) => {
          if (!open) drive.setRenameTarget(null);
        }}
        onSuccess={() => void drive.handleRefresh()}
      />
      <DriveDeleteDialogs
        bulkDeleteDialogOpen={drive.bulkDeleteDialogOpen}
        deleteMutation={drive.deleteMutation}
        deleteTarget={drive.deleteTarget}
        selectedItems={drive.selection.selectedItems}
        setBulkDeleteDialogOpen={drive.setBulkDeleteDialogOpen}
        setDeleteTarget={drive.setDeleteTarget}
      />
    </div>
  );
}
