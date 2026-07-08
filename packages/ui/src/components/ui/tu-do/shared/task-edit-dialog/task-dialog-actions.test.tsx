/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDialogActions } from './task-dialog-actions';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

describe('TaskDialogActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the optional archive action in the edit menu', () => {
    const onArchiveTask = vi.fn();
    const onMoreMenuOpenChange = vi.fn();

    render(
      <TaskDialogActions
        boardId="board-1"
        hasDraft={false}
        isCreateMode={false}
        moreMenuOpen
        onArchiveTask={onArchiveTask}
        onClearDraft={vi.fn()}
        onClose={vi.fn()}
        onMoreMenuOpenChange={onMoreMenuOpenChange}
        onShowDeleteDialog={vi.fn()}
        taskId="task-1"
        wsId="workspace-1"
      />
    );

    fireEvent.click(screen.getByText('common.archive'));

    expect(onArchiveTask).toHaveBeenCalledTimes(1);
    expect(onMoreMenuOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the archive action hidden when no handler is provided', () => {
    render(
      <TaskDialogActions
        boardId="board-1"
        hasDraft={false}
        isCreateMode={false}
        moreMenuOpen
        onClearDraft={vi.fn()}
        onClose={vi.fn()}
        onMoreMenuOpenChange={vi.fn()}
        onShowDeleteDialog={vi.fn()}
        taskId="task-1"
        wsId="workspace-1"
      />
    );

    expect(screen.queryByText('common.archive')).not.toBeInTheDocument();
  });
});
