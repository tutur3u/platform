/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRowActionsMenu } from './task-row-actions-menu';

const { handleMoveToCloseMock, openTaskMock, useTaskActionsMock } = vi.hoisted(
  () => ({
    handleMoveToCloseMock: vi.fn(),
    openTaskMock: vi.fn(),
    useTaskActionsMock: vi.fn(),
  })
);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@tuturuuu/tasks-ui/hooks/use-task-actions', () => ({
  useTaskActions: () => useTaskActionsMock(),
}));

vi.mock('../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({ openTask: openTaskMock }),
}));

vi.mock('../boards/boardId/menus', () => ({
  TaskDueDateMenu: ({
    translations,
  }: {
    translations: { dueDate: string };
  }) => <div>{translations.dueDate}</div>,
  TaskMoveMenu: ({ translations }: { translations: { move: string } }) => (
    <div>{translations.move}</div>
  ),
  TaskPriorityMenu: ({
    translations,
  }: {
    translations: { priority: string };
  }) => <div>{translations.priority}</div>,
  TaskSchedulingMenu: ({
    translations,
  }: {
    translations: { schedule: string };
  }) => <div>{translations.schedule}</div>,
}));

const documentList = {
  id: 'documents-list',
  name: 'Documents',
  board_id: 'board-1',
  status: 'documents',
  created_at: '2026-07-01T00:00:00.000Z',
  deleted: false,
} as TaskList;

const closedList = {
  id: 'closed-list',
  name: 'Closed',
  board_id: 'board-1',
  status: 'closed',
  created_at: '2026-07-01T00:00:00.000Z',
  deleted: false,
} as TaskList;

const task = {
  id: 'task-1',
  name: 'Document task',
  list_id: documentList.id,
  created_at: '2026-07-01T00:00:00.000Z',
  display_number: 1,
} as Task;

describe('TaskRowActionsMenu document tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskActionsMock.mockReturnValue({
      handleDelete: vi.fn(),
      handleDueDateChange: vi.fn(),
      handleMoveToClose: handleMoveToCloseMock,
      handleMoveToCompletion: vi.fn(),
      handleMoveToList: vi.fn(),
      handlePriorityChange: vi.fn(),
    });
  });

  it('shows Archive for document-list tasks while hiding workflow-only actions', () => {
    render(
      <TaskRowActionsMenu
        boardId="board-1"
        lists={[documentList, closedList]}
        onOpenChange={vi.fn()}
        onUpdate={vi.fn()}
        open
        task={task}
        trigger={<button type="button">Actions</button>}
        workspaceId="workspace-1"
      />
    );

    expect(screen.getByText('archive')).toBeInTheDocument();
    expect(screen.queryByText('mark_as_done')).not.toBeInTheDocument();
    expect(screen.queryByText('mark_as_closed')).not.toBeInTheDocument();
    expect(screen.queryByText('start_tracking_time')).not.toBeInTheDocument();
    expect(screen.queryByText('due_date')).not.toBeInTheDocument();
    expect(
      screen.queryByText('ws-task-boards.dialog.schedule')
    ).not.toBeInTheDocument();
  });

  it('hides Archive for document-list tasks when the board has no closed list', () => {
    render(
      <TaskRowActionsMenu
        boardId="board-1"
        lists={[documentList]}
        onOpenChange={vi.fn()}
        onUpdate={vi.fn()}
        open
        task={task}
        trigger={<button type="button">Actions</button>}
        workspaceId="workspace-1"
      />
    );

    expect(screen.queryByText('archive')).not.toBeInTheDocument();
  });
});
