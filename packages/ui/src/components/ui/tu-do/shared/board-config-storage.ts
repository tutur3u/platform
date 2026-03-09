'use client';

import type { TaskFilters } from '../boards/boardId/task-filter';

export type StoredBoardView = 'kanban' | 'list' | 'timeline';
export type StoredListStatusFilter = 'all' | 'active' | 'not_started';

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
