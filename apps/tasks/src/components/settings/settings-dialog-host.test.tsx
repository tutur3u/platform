import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: {
    settingsBoardId: null as string | null,
    settingsDialog: null as string | null,
    settingsTab: null as string | null,
  },
  setQuery: vi.fn(),
  shortcut: vi.fn(),
}));

vi.mock('nuqs', () => ({
  parseAsString: {},
  useQueryStates: () => [mocks.query, mocks.setQuery],
}));
vi.mock('@tuturuuu/ui/hooks/use-settings-dialog-shortcut', () => ({
  useSettingsDialogShortcut: mocks.shortcut,
}));
vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) =>
    open ? (
      <div role="dialog">
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));
vi.mock('./settings-dialog', () => ({
  SettingsDialog: ({
    boardId,
    defaultTab,
    onBoardSettingsOpen,
  }: {
    boardId?: string;
    defaultTab?: string;
    onBoardSettingsOpen: (boardId: string) => void;
  }) => (
    <div data-testid="settings-content">
      {defaultTab ?? 'default'}:{boardId ?? 'none'}
      <button type="button" onClick={() => onBoardSettingsOpen('board-2')}>
        Board
      </button>
    </div>
  ),
}));

import { SettingsDialogHost } from './settings-dialog-host';

const user = { id: 'actor' } as WorkspaceUser;
const options = { scroll: false, shallow: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = {
    settingsBoardId: null,
    settingsDialog: null,
    settingsTab: null,
  };
});
afterEach(cleanup);

describe('Tasks settings dialog host', () => {
  it('opens a bare settingsTab deep link with its board context', () => {
    mocks.query = {
      settingsBoardId: 'board-1',
      settingsDialog: null,
      settingsTab: 'task_board',
    };
    render(<SettingsDialogHost user={user} wsId="personal" />);

    expect(screen.getByTestId('settings-content').textContent).toContain(
      'task_board:board-1'
    );
  });

  it('pushes board settings intents with the board id', () => {
    render(<SettingsDialogHost user={user} wsId="personal" />);

    window.dispatchEvent(
      new CustomEvent('tuturuuu:settings-dialog-open-intent', {
        cancelable: true,
        detail: { settingsBoardId: 'board-1', settingsTab: 'task_board' },
      })
    );

    expect(mocks.setQuery).toHaveBeenCalledWith(
      {
        settingsBoardId: 'board-1',
        settingsDialog: 'open',
        settingsTab: 'task_board',
      },
      { ...options, history: 'push' }
    );
  });

  it('switches boards in place and clears every param on close', () => {
    mocks.query = {
      settingsBoardId: 'board-1',
      settingsDialog: 'open',
      settingsTab: 'task_board',
    };
    render(<SettingsDialogHost user={user} wsId="personal" />);

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(mocks.setQuery).toHaveBeenLastCalledWith(
      {
        settingsBoardId: 'board-2',
        settingsDialog: 'open',
        settingsTab: 'task_board',
      },
      { ...options, history: 'replace' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mocks.setQuery).toHaveBeenLastCalledWith(
      { settingsBoardId: null, settingsDialog: null, settingsTab: null },
      { ...options, history: 'replace' }
    );
  });
});
