'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { TaskBoardLoadingState } from './task-board-loading-state';

const MAX_AUTOMATIC_PAGES = 3;

export interface BoardTaskPaging {
  hasMore: boolean;
  nextCursor?: string | null;
  pending: boolean;
  failed: boolean;
  loadMore: () => void;
}

export function BoardTaskPageFrame({
  children,
  paging,
  onClearFilters,
  emptyAction,
  emptyKanban = false,
}: {
  children: ReactNode;
  emptyKanban?: boolean;
  emptyAction?: ReactNode;
  onClearFilters?: () => void;
  paging: BoardTaskPaging | null;
}) {
  const t = useTranslations('common');
  const board = useTranslations('ws-task-boards.header');
  const awaitingVisibleTasks = emptyKanban && Boolean(paging?.hasMore);
  const attemptedCursors = useRef(new Set<string>());
  const nextCursor = paging?.nextCursor;
  const loadMore = paging?.loadMore;
  const pending = paging?.pending;
  const failed = paging?.failed;
  useEffect(() => {
    const attempted = attemptedCursors.current;
    if (!awaitingVisibleTasks) {
      attempted.clear();
      return;
    }
    if (
      !nextCursor ||
      !loadMore ||
      pending ||
      failed ||
      attempted.has(nextCursor) ||
      attempted.size >= MAX_AUTOMATIC_PAGES
    ) {
      return;
    }
    attempted.add(nextCursor);
    loadMore();
  }, [awaitingVisibleTasks, failed, loadMore, nextCursor, pending]);

  if (!paging) {
    return emptyKanban && onClearFilters ? (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="status">{board('no_matching_tasks')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onClearFilters}>{board('clear_filters')}</Button>
          {emptyAction}
        </div>
      </div>
    ) : (
      children
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {awaitingVisibleTasks ? pending && <TaskBoardLoadingState /> : children}
      </div>
      <div
        className="flex shrink-0 justify-center gap-2 px-2 py-1"
        aria-live="polite"
      >
        {awaitingVisibleTasks && onClearFilters && !pending ? (
          <Button size="sm" onClick={onClearFilters}>
            {board('clear_filters')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={paging.pending}
          aria-busy={paging.pending}
          onClick={paging.loadMore}
        >
          {t(
            paging.pending
              ? 'loading_more_tasks'
              : paging.failed
                ? 'retry'
                : 'load_more'
          )}
        </Button>
      </div>
    </div>
  );
}
