'use client';

import type { DriveBrowserState } from './drive-browser-state';
import { DriveFileGrid } from './drive-grid-view';
import { DriveListView } from './drive-list-view';
import {
  DriveDeniedState,
  DriveEmptyState,
  DriveErrorState,
  DriveLoadingState,
  DriveNoResultsState,
} from './drive-state-views';
import type { DriveCollectionProps } from './drive-view-helpers';
import type { DriveViewMode } from './search-params';

interface DriveBrowserViewProps extends Omit<
  DriveCollectionProps,
  'files' | 'folders'
> {
  onClearFilters: () => void;
  onRetry: () => void;
  onSelectAll: (checked: boolean) => void;
  onUpload: () => void;
  state: DriveBrowserState;
  view: DriveViewMode;
}

export function DriveBrowserView({
  onClearFilters,
  onRetry,
  onSelectAll,
  onUpload,
  state,
  view,
  ...collection
}: DriveBrowserViewProps) {
  switch (state.kind) {
    case 'denied':
      return <DriveDeniedState />;
    case 'loading':
      return <DriveLoadingState view={view} />;
    case 'error':
      return <DriveErrorState onRetry={onRetry} />;
    case 'empty-root':
    case 'empty-folder':
      return (
        <DriveEmptyState
          canManage={collection.actions.canManage}
          inFolder={state.kind === 'empty-folder'}
          onUpload={onUpload}
        />
      );
    case 'no-results':
      return (
        <DriveNoResultsState onClear={onClearFilters} query={state.query} />
      );
    case 'ready':
      return view === 'grid' ? (
        <DriveFileGrid
          {...collection}
          files={state.files}
          folders={state.folders}
        />
      ) : (
        <DriveListView
          {...collection}
          files={state.files}
          folders={state.folders}
          onSelectAll={onSelectAll}
        />
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
