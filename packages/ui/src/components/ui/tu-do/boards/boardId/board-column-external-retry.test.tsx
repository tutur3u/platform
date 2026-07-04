/**
 * @vitest-environment jsdom
 */

import { act, render, waitFor } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListPaginationState } from '../../shared/progressive-loader-context';
import { BoardColumn } from './board-column';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  loadListPage: vi.fn(),
  pagination: {} as Record<string, ListPaginationState>,
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock('../../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({
    createTask: mocks.createTask,
  }),
}));

vi.mock('../../shared/progressive-loader-context', () => ({
  useProgressiveLoader: () => ({
    loadListPage: mocks.loadListPage,
    pagination: mocks.pagination,
    revalidateLoadedLists: vi.fn(),
  }),
}));

vi.mock('./list-actions', () => ({
  ListActions: () => <div data-testid="list-actions" />,
}));

vi.mock('./task-list', () => ({
  VirtualizedTaskList: () => <div data-testid="task-list" />,
}));

const externalColumn: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'CYAN',
  created_at: '2026-06-16T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'personal-external-staging:board-1',
  is_external_staging: true,
  name: 'External tasks',
  position: 0,
  status: 'active',
};

const loadedExternalState: ListPaginationState = {
  hasMore: true,
  isInitialLoad: false,
  isLoading: false,
  page: 0,
  totalCount: 0,
};

function renderExternalColumn() {
  return (
    <BoardColumn
      boardId="board-1"
      column={externalColumn}
      tasks={[]}
      wsId="personal"
    />
  );
}

describe('BoardColumn external lane retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pagination = {
      [externalColumn.id]: loadedExternalState,
    };
    mocks.loadListPage.mockRejectedValue(
      new Error('external lane unavailable')
    );
  });

  it('does not immediately retry the same failed external-options signature', async () => {
    const { rerender } = render(renderExternalColumn());

    await waitFor(() => {
      expect(mocks.loadListPage).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await Promise.resolve();
      rerender(renderExternalColumn());
      await Promise.resolve();
    });

    expect(mocks.loadListPage).toHaveBeenCalledTimes(1);
    expect(mocks.loadListPage).toHaveBeenCalledWith(externalColumn.id, 0, {
      externalIncludeDocuments: false,
      externalIncludeDoneClosed: false,
      externalSortBy: 'created-desc',
    });
  });
});
