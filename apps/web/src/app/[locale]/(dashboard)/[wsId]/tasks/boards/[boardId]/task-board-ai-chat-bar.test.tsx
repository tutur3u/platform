import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardAiChatBar } from './task-board-ai-chat-bar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@tuturuuu/ui/tu-do/my-tasks/task-preview-dialog', () => ({
  TaskPreviewDialog: () => null,
}));

vi.mock('./task-board-ai-chat-bar-controls', () => ({
  ModeButton: ({
    active,
    children,
    onClick,
  }: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
  }) => (
    <button type="button" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  ),
  TaskBoardMiraChatPopup: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mira-popup" /> : null,
  TaskBoardTaskComposer: ({ open }: { open: boolean }) =>
    open ? <textarea aria-label="task-input" /> : null,
}));

vi.mock('./use-task-board-ai-chat-bar-task-flow', () => ({
  useTaskBoardAiChatBarTaskFlow: () => ({
    activeLists: [
      {
        id: 'list-1',
        name: 'To Do',
        position: 0,
        status: 'not_started',
      },
    ],
    aiTaskMode: false,
    boardConfig: null,
    boardName: 'Launch Board',
    canCreateTask: true,
    clientTimezone: 'UTC',
    currentPreviewIndex: 0,
    handleConfirmReview: vi.fn(),
    handleTaskSubmit: vi.fn(),
    isWorking: false,
    lastResult: null,
    listsLoading: false,
    previewEntry: null,
    previewOpen: false,
    selectedLabelIds: [],
    selectedList: {
      id: 'list-1',
      name: 'To Do',
      position: 0,
      status: 'not_started',
    },
    selectedListId: 'list-1',
    setAiTaskMode: vi.fn(),
    setCurrentPreviewIndex: vi.fn(),
    setPreviewOpen: vi.fn(),
    setSelectedLabelIds: vi.fn(),
    setSelectedListId: vi.fn(),
    setTaskInput: vi.fn(),
    submitTaskInput: vi.fn(),
    taskInput: '',
    workspaceLabels: [],
    workspaceProjects: [],
  }),
}));

describe('TaskBoardAiChatBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-collapses three seconds after the task composer loses focus', () => {
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);

    render(
      <TaskBoardAiChatBar
        assistantName="Mira"
        boardId="board-1"
        currentUser={{ id: 'user-1' }}
        wsId="workspace-1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'add_task' }));

    const input = screen.getByLabelText('task-input');
    input.focus();
    fireEvent.blur(input, { relatedTarget: outsideButton });
    outsideButton.focus();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByLabelText('task-input')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByLabelText('task-input')).toBeNull();

    outsideButton.remove();
  });
});
