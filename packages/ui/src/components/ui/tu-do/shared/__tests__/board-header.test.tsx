import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardHeader } from '../board-header';

let boardLayoutSettingsProps:
  | React.ComponentProps<
      typeof import('../board-layout-settings')['BoardLayoutSettings']
    >
  | undefined;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@tuturuuu/ui/hooks/use-board-actions', () => ({
  useBoardActions: () => ({
    archiveBoard: vi.fn(),
    unarchiveBoard: vi.fn(),
  }),
}));

vi.mock('../tasks-route-context', () => ({
  useTasksHref: () => '/tasks',
}));

vi.mock('../board-layout-settings', () => ({
  BoardLayoutSettings: (props: any) => {
    boardLayoutSettingsProps = props;
    return (
      <div
        data-testid="board-layout-settings"
        data-board-id={props.boardId}
        data-ws-id={props.wsId ?? ''}
      />
    );
  },
}));

vi.mock('../board-switcher', () => ({
  BoardSwitcher: () => <div data-testid="board-switcher" />,
}));

vi.mock('../board-user-presence-avatars', () => ({
  BoardUserPresenceAvatarsComponent: () => (
    <div data-testid="board-user-presence" />
  ),
}));

vi.mock('../boards/boardId/task-filter', () => ({
  TaskFilter: () => <div data-testid="task-filter" />,
}));

vi.mock('../boards/copy-board-dialog', () => ({
  CopyBoardDialog: () => <div data-testid="copy-board-dialog" />,
}));

vi.mock('../boards/form', () => ({
  TaskBoardForm: () => <div data-testid="task-board-form" />,
}));

vi.mock('../templates/save-as-template-dialog', () => ({
  SaveAsTemplateDialog: () => <div data-testid="save-as-template-dialog" />,
}));

const mockBoard = {
  archived_at: null,
  id: 'board-1',
  name: 'Roadmap',
  ticket_prefix: 'RD',
  ws_id: 'ws-1',
} as const;

function renderBoardHeader() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardHeader
        board={mockBoard}
        currentView="kanban"
        filters={{
          assignees: [],
          dueDateRange: null,
          estimationRange: null,
          includeMyTasks: false,
          includeUnassigned: false,
          labels: [],
          priorities: [],
          projects: [],
        }}
        isMultiSelectMode={false}
        isPersonalWorkspace={false}
        listStatusFilter="all"
        onFiltersChange={vi.fn()}
        onListStatusFilterChange={vi.fn()}
        onUpdate={vi.fn()}
        onViewChange={vi.fn()}
        setIsMultiSelectMode={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('BoardHeader', () => {
  beforeEach(() => {
    boardLayoutSettingsProps = undefined;
  });

  it('passes the workspace id to board layout settings', () => {
    renderBoardHeader();

    expect(screen.getByTestId('board-layout-settings')).toHaveAttribute(
      'data-ws-id',
      'ws-1'
    );
    expect(boardLayoutSettingsProps?.boardId).toBe('board-1');
    expect(boardLayoutSettingsProps?.wsId).toBe('ws-1');
  });
});
