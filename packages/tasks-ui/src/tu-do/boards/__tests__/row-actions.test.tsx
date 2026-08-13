import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardActions } from '../row-actions';

const actionMocks = vi.hoisted(() => ({
  archiveBoard: vi.fn(),
  softDeleteBoard: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@tuturuuu/ui/hooks/use-board-actions', () => ({
  useBoardActions: () => ({
    archiveBoard: actionMocks.archiveBoard,
    duplicateBoard: vi.fn(),
    isArchiving: false,
    isDeleting: false,
    isPermanentlyDeleting: false,
    isRestoring: false,
    isUnarchiving: false,
    permanentDeleteBoard: vi.fn(),
    restoreBoard: vi.fn(),
    softDeleteBoard: actionMocks.softDeleteBoard,
    unarchiveBoard: vi.fn(),
  }),
}));

vi.mock('@tuturuuu/ui/custom/modifiable-dialog-trigger', () => ({
  default: () => null,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@tuturuuu/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock('../../templates/save-as-template-dialog', () => ({
  SaveAsTemplateDialog: () => null,
}));

vi.mock('../board-share-dialog', () => ({
  BoardShareDialog: () => null,
}));

vi.mock('../form', () => ({
  TaskBoardForm: () => null,
}));

describe('BoardActions', () => {
  beforeEach(() => {
    actionMocks.archiveBoard.mockReset();
    actionMocks.softDeleteBoard.mockReset();
  });

  it('keeps the archive confirmation open until success and then leaves the board', () => {
    const onBoardUnavailable = vi.fn();
    actionMocks.archiveBoard.mockImplementation(
      (_boardId: string, options: { onSuccess?: () => void }) =>
        options.onSuccess?.()
    );

    render(
      <BoardActions
        board={{ id: 'board-1', name: 'Roadmap', ws_id: 'ws-1' }}
        onBoardUnavailable={onBoardUnavailable}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-task-boards.row_actions.archive',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-task-boards.row_actions.dialog.archive_button',
      })
    );

    expect(actionMocks.archiveBoard).toHaveBeenCalledWith(
      'board-1',
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(onBoardUnavailable).toHaveBeenCalledTimes(1);
  });

  it('leaves the current board after it is moved to trash', () => {
    const onBoardUnavailable = vi.fn();
    actionMocks.softDeleteBoard.mockImplementation(
      (_boardId: string, options: { onSuccess?: () => void }) =>
        options.onSuccess?.()
    );

    render(
      <BoardActions
        board={{ id: 'board-1', name: 'Roadmap', ws_id: 'ws-1' }}
        onBoardUnavailable={onBoardUnavailable}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-task-boards.row_actions.dialog.delete_button',
      })
    );

    expect(actionMocks.softDeleteBoard).toHaveBeenCalledWith(
      'board-1',
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(onBoardUnavailable).toHaveBeenCalledTimes(1);
  });
});
