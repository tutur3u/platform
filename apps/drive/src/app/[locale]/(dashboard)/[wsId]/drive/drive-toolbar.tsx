'use client';

import { RefreshCw, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import DriveBreadcrumbs from './breadcrumbs';
import { DriveResultSummary } from './drive-result-summary';
import { DriveSelectionBar } from './drive-selection-bar';
import {
  SortBySelect,
  SortOrderSelect,
  ViewModeToggle,
} from './drive-toolbar-controls';
import type {
  DriveSearchState,
  DriveSortBy,
  DriveViewMode,
} from './search-params';

interface DriveToolbarProps {
  currentFileCount: number;
  currentFolderCount: number;
  currentPath: string;
  directoryLabel: string;
  isReady: boolean;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onNavigateToPath: (path: string) => void;
  onNavigateUp: () => void;
  onRefresh: () => void | Promise<void>;
  onSelectAllVisible: () => void;
  searchState: DriveSearchState;
  selectedCount: number;
  showingCount: number;
  total: number;
  updateSearchState: (
    updates: Partial<{
      path: string | null;
      q: string | null;
      sortBy: DriveSortBy;
      sortOrder: 'asc' | 'desc';
      view: DriveViewMode;
    }>
  ) => void;
}

export function DriveToolbar({
  currentFileCount,
  currentFolderCount,
  currentPath,
  directoryLabel,
  isReady,
  onClearSelection,
  onDeleteSelection,
  onNavigateToPath,
  onNavigateUp,
  onRefresh,
  onSelectAllVisible,
  searchState,
  selectedCount,
  showingCount,
  total,
  updateSearchState,
}: DriveToolbarProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Card className="sticky top-4 z-20 rounded-[28px] border-dynamic-border/80 bg-background/90 shadow-sm backdrop-blur">
      <CardContent className="space-y-5 p-5">
        <DriveBreadcrumbs
          path={currentPath}
          onNavigate={onNavigateToPath}
          onNavigateUp={onNavigateUp}
        />
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_13rem_11rem_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchState.q}
              onChange={(event) =>
                updateSearchState({ q: event.target.value || null })
              }
              placeholder={t('search_placeholder')}
              className="h-11 rounded-2xl border-dynamic-border/80 bg-background pl-11"
            />
          </div>
          <SortBySelect
            value={searchState.sortBy}
            onChange={(sortBy) => updateSearchState({ sortBy })}
          />
          <SortOrderSelect
            value={searchState.sortOrder}
            onChange={(sortOrder) => updateSearchState({ sortOrder })}
          />
          <ViewModeToggle
            value={searchState.view}
            onChange={(view) => updateSearchState({ view })}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-dynamic-border/80"
            onClick={() => void onRefresh()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('refresh')}
          </Button>
        </div>
        {isReady ? (
          <DriveResultSummary
            currentFileCount={currentFileCount}
            currentFolderCount={currentFolderCount}
            currentPath={currentPath}
            directoryLabel={directoryLabel}
            query={searchState.q}
            showingCount={showingCount}
            total={total}
          />
        ) : null}
        <DriveSelectionBar
          count={selectedCount}
          onClearSelection={onClearSelection}
          onDelete={onDeleteSelection}
          onSelectAllVisible={onSelectAllVisible}
        />
      </CardContent>
    </Card>
  );
}
