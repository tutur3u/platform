/**
 * @vitest-environment jsdom
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
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

const regularColumn: TaskList = {
  ...externalColumn,
  color: 'BLUE',
  id: 'list-1',
  is_external_staging: false,
  name: 'In progress',
};

const regularTasks = [
  { id: 'task-1', list_id: regularColumn.id, name: 'First task' },
  { id: 'task-2', list_id: regularColumn.id, name: 'Second task' },
] as Task[];

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

  it('replaces the status icon with a stable select-all checkbox in bulk mode', () => {
    mocks.pagination = {
      [regularColumn.id]: {
        ...loadedExternalState,
        hasMore: false,
        totalCount: regularTasks.length,
      },
    };
    const onTaskSelect = vi.fn();

    render(
      <BoardColumn
        boardId="board-1"
        column={regularColumn}
        isMultiSelectMode
        onTaskSelect={onTaskSelect}
        selectedTasks={new Set(['task-1'])}
        setIsMultiSelectMode={vi.fn()}
        tasks={regularTasks}
        wsId="workspace-1"
      />
    );

    const checkbox = screen.getByRole('checkbox', {
      name: 'select_all_tasks',
    });
    expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
    expect(checkbox).toHaveClass(
      'border-2',
      'border-dynamic-blue/70',
      'bg-dynamic-blue/5',
      'shadow-sm'
    );
    expect(checkbox.className).toContain(
      'data-[state=checked]:border-dynamic-blue/70'
    );

    fireEvent.click(checkbox);

    expect(onTaskSelect).toHaveBeenCalledTimes(1);
    expect(onTaskSelect).toHaveBeenCalledWith(
      'task-2',
      expect.objectContaining({ shiftKey: false })
    );
  });

  it('offers collapse controls for regular task lists', () => {
    mocks.pagination = {
      [regularColumn.id]: {
        ...loadedExternalState,
        hasMore: false,
      },
    };
    const onTaskListCollapsedChange = vi.fn();

    render(
      <BoardColumn
        boardId="board-1"
        column={regularColumn}
        onTaskListCollapsedChange={onTaskListCollapsedChange}
        tasks={regularTasks}
        wsId="workspace-1"
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'collapse_task_list:list_name_in_progress',
      })
    );

    expect(onTaskListCollapsedChange).toHaveBeenCalledWith('list-1', true);
  });
});
