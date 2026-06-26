import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksNoBoardClient } from './tasks-no-board-client';

const mocks = vi.hoisted(() => ({
  TaskBoardForm: vi.fn(),
  updateUserWorkspaceConfig: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  TASK_DEFAULT_BOARD_ID_CONFIG_ID: 'TASK_DEFAULT_BOARD_ID',
  TASK_LAST_BOARD_VIEW_CONFIG_ID: 'TASK_LAST_BOARD_VIEW',
  updateUserWorkspaceConfig: mocks.updateUserWorkspaceConfig,
}));

vi.mock('@tuturuuu/ui/tu-do/boards/form', () => ({
  TaskBoardForm: mocks.TaskBoardForm,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('TasksNoBoardClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.TaskBoardForm.mockImplementation(
      ({ data, wsId }: { data?: { name?: string }; wsId: string }) => (
        <div data-board-name={data?.name} data-testid="task-board-form">
          {wsId}
        </div>
      )
    );
  });

  it('renders the create board form directly without duplicated empty-state copy', () => {
    render(
      <TasksNoBoardClient
        initialView="kanban"
        routeWsId="ws-route"
        workspaceId="ws-actual"
      />
    );

    const shell = screen.getByTestId('tasks-no-board-shell');
    const content = screen.getByTestId('tasks-no-board-content');
    const form = screen.getByTestId('task-board-form');

    expect(shell).toHaveClass('items-center', 'justify-center');
    expect(content).toHaveClass('max-w-3xl');
    expect(content).not.toHaveClass(
      'rounded-xl',
      'border',
      'bg-background',
      'shadow-sm'
    );
    expect(form).toHaveAttribute(
      'data-board-name',
      'ws-tasks.default_board_name'
    );
    expect(
      screen.queryByText('ws-tasks.no_boards_title')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('ws-tasks.no_boards_description')
    ).not.toBeInTheDocument();
    expect(mocks.TaskBoardForm).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'ws-tasks.default_board_name' },
        wsId: 'ws-actual',
      }),
      undefined
    );
  });
});
