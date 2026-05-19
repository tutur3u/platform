import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskBoardMiraChatPopup } from './task-board-ai-chat-bar-controls';

vi.mock('../../../(dashboard)/components/mira-chat-panel', () => ({
  default: ({
    isFullscreen,
    onToggleFullscreen,
    taskBoardContext,
  }: {
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    taskBoardContext?: unknown;
  }) => (
    <button
      type="button"
      data-fullscreen={String(isFullscreen)}
      data-has-context={String(Boolean(taskBoardContext))}
      onClick={onToggleFullscreen}
    >
      Mira panel
    </button>
  ),
}));

describe('TaskBoardMiraChatPopup', () => {
  it('passes maximized state and task board context into the Mira panel', () => {
    const onToggleMaximized = vi.fn();

    render(
      <TaskBoardMiraChatPopup
        assistantName="Mira"
        autoFocusSignal={1}
        boardId="board-1"
        chatPanelResetKey={0}
        currentUser={{ id: 'user-1' }}
        maximized
        onResetPanelState={vi.fn()}
        onToggleMaximized={onToggleMaximized}
        open
        taskBoardContext={{
          boardId: 'board-1',
          boardName: 'Launch Board',
          lists: [],
          workspaceId: 'workspace-1',
        }}
        wsId="workspace-1"
      />
    );

    const panel = screen.getByRole('button', { name: 'Mira panel' });
    expect(panel).toHaveAttribute('data-fullscreen', 'true');
    expect(panel).toHaveAttribute('data-has-context', 'true');

    panel.click();
    expect(onToggleMaximized).toHaveBeenCalledTimes(1);
  });
});
