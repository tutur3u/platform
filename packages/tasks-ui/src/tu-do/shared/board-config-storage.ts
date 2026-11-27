'use client';

import { z } from 'zod';
import type { TaskFilters } from '../boards/boardId/task-filter';
import {
  sanitizeListStatusFilter,
  sanitizeSavedBoardFilters,
} from './board-header/board-filter-state';

export type StoredBoardView =
  | 'kanban'
  | 'list'
  | 'my_tasks'
  | 'timeline'
  | 'fleet'
  | 'drafts'
  | 'recycle_bin';
export type StoredListStatusFilter = 'all' | 'active' | 'not_started' | 'open';

export interface BoardViewConfig {
  currentView: StoredBoardView;
  filters: TaskFilters;
  listStatusFilter: StoredListStatusFilter;
}

export function getBoardConfigKey(boardId: string): string {
  return `board_config_${boardId}`;
}

export function loadBoardConfig(boardId: string): BoardViewConfig | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(getBoardConfigKey(boardId));
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.currentView !== 'string' ||
      typeof parsed.filters !== 'object' ||
      parsed.filters === null ||
      typeof parsed.listStatusFilter !== 'string'
    ) {
      console.warn('Invalid board config structure, ignoring');
      return null;
    }

    if (
      parsed.filters.dueDateRange &&
      typeof parsed.filters.dueDateRange === 'object'
    ) {
      const { from, to } = parsed.filters.dueDateRange;
      const newRange: { from?: Date; to?: Date } = {};

      if (typeof from === 'string') {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          newRange.from = fromDate;
        }
      } else if (from instanceof Date && !Number.isNaN(from.getTime())) {
        newRange.from = from;
      }

      if (typeof to === 'string') {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          newRange.to = toDate;
        }
      } else if (to instanceof Date && !Number.isNaN(to.getTime())) {
        newRange.to = to;
      }

      if (newRange.from || newRange.to) {
        parsed.filters.dueDateRange = newRange;
      } else {
        delete parsed.filters.dueDateRange;
      }
    }

    return parsed as BoardViewConfig;
  } catch (error) {
    console.error('Failed to load board config from localStorage:', error);
    return null;
  }
}

export function saveBoardConfig(
  boardId: string,
  config: BoardViewConfig
): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(getBoardConfigKey(boardId), JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save board config to localStorage:', error);
  }
}

export function resolveBoardViewConfig({
  boardId,
  defaultView,
  enabledViews,
  hideEmptyTaskListsByDefault,
  viewIsEnabled,
}: {
  boardId: string;
  defaultView?: StoredBoardView;
  enabledViews: readonly StoredBoardView[] | null;
  hideEmptyTaskListsByDefault: boolean;
  viewIsEnabled: (view: StoredBoardView) => boolean;
}): BoardViewConfig {
  const saved = loadBoardConfig(boardId);
  const requestedView =
    typeof window !== 'undefined' &&
    window.location.pathname.includes('/tasks/boards/')
      ? (new URLSearchParams(window.location.search).get(
          'view'
        ) as StoredBoardView | null)
      : null;
  const filters = sanitizeSavedBoardFilters(saved?.filters);
  // The local restore verifies projects through the API's UUID lookup.
  const projectId = z.guid();
  filters.projects = filters.projects.filter(
    ({ id }) => projectId.safeParse(id).success
  );
  const savedView = saved?.currentView;
  return {
    currentView:
      (requestedView && viewIsEnabled(requestedView) && requestedView) ||
      (defaultView && viewIsEnabled(defaultView) && defaultView) ||
      (savedView && viewIsEnabled(savedView) && savedView) ||
      enabledViews?.[0] ||
      'kanban',
    filters:
      (filters.hideEmptyTaskLists ?? hideEmptyTaskListsByDefault)
        ? { ...filters, hideEmptyTaskLists: true }
        : filters,
    listStatusFilter: sanitizeListStatusFilter(saved?.listStatusFilter),
  };
}
