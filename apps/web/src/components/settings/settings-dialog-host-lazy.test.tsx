import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialogHost } from '../../app/[locale]/settings-dialog-host';

const state = vi.hoisted(() => ({
  // null while the lazy settings dialog import is still pending.
  lazyComponent: null as null | (() => ReactNode),
  openShortcut: null as null | (() => void),
  params: {} as Record<string, string>,
  pathname: '/personal',
  query: {
    settingsBoardId: null as string | null,
    settingsDialog: null as string | null,
    settingsLinkedProvider: null as string | null,
    settingsTab: null as string | null,
  },
  setQuery: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => state.params,
  usePathname: () => state.pathname,
}));
vi.mock('nuqs', () => ({
  parseAsString: {},
  useQueryStates: () => [state.query, state.setQuery],
}));
vi.mock('@/hooks/use-lazy-client-component', () => ({
  useLazyClientComponent: (_load: unknown, enabled: boolean) =>
    enabled ? state.lazyComponent : null,
}));
vi.mock('@/components/settings/settings-dialog', () => ({
  SettingsDialog: () => <div data-testid="settings-dialog" />,
}));
vi.mock('@/components/settings/use-settings-dialog-shortcut', () => ({
  useSettingsDialogShortcut: ({ onOpen }: { onOpen: () => void }) => {
    state.openShortcut = onOpen;
  },
}));
vi.mock('@/components/settings/settings-dialog-skeleton', () => ({
  SettingsDialogFullscreenSkeleton: () => (
    <div data-testid="settings-dialog-skeleton" />
  ),
}));
vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

const user = { id: 'user-1' } as never;

function renderHost() {
  return render(<SettingsDialogHost user={user} wsId="personal" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.lazyComponent = null;
  state.openShortcut = null;
  state.params = {};
  state.pathname = '/personal';
  state.query = {
    settingsBoardId: null,
    settingsDialog: null,
    settingsLinkedProvider: null,
    settingsTab: null,
  };
});
afterEach(cleanup);

describe('SettingsDialogHost optimistic open intent', () => {
  it('stays closed after Back while the lazy dialog import is pending', () => {
    const view = renderHost();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('tuturuuu:settings-dialog-open-intent', {
          detail: { settingsTab: 'workspace_members' },
        })
      );
    });
    // Optimistic intent shows the loading skeleton before the URL round-trip.
    expect(screen.getByTestId('settings-dialog-skeleton')).toBeInTheDocument();

    // The URL acknowledges the open while the import is still pending.
    state.query = {
      ...state.query,
      settingsDialog: 'open',
      settingsTab: 'workspace_members',
    };
    view.rerender(<SettingsDialogHost user={user} wsId="personal" />);
    expect(screen.getByTestId('settings-dialog-skeleton')).toBeInTheDocument();

    // Back: the URL closes the dialog before the import resolves.
    state.query = { ...state.query, settingsDialog: null, settingsTab: null };
    view.rerender(<SettingsDialogHost user={user} wsId="personal" />);
    expect(screen.queryByRole('dialog')).toBeNull();

    // The import resolves afterwards; the dialog must not reappear.
    state.lazyComponent = () => <div data-testid="settings-dialog" />;
    view.rerender(<SettingsDialogHost user={user} wsId="personal" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('settings-dialog')).toBeNull();
  });

  it('stays closed after Back when a second open arrives after the URL acknowledged it', () => {
    state.params = { boardId: 'board-1' };
    state.pathname = '/personal/tasks/boards/board-1';
    const view = renderHost();
    const rerender = () =>
      view.rerender(<SettingsDialogHost user={user} wsId="personal" />);

    // First Cmd/Ctrl+, on a board route opens board settings optimistically.
    act(() => state.openShortcut?.());
    expect(screen.getByTestId('settings-dialog-skeleton')).toBeInTheDocument();

    // The URL acknowledges the open while the import is still pending.
    state.query = {
      ...state.query,
      settingsBoardId: 'board-1',
      settingsDialog: 'open',
      settingsTab: 'task_board',
    };
    rerender();

    // A second Cmd/Ctrl+, re-creates the optimistic intent while already open.
    act(() => state.openShortcut?.());
    rerender();
    expect(screen.getByTestId('settings-dialog-skeleton')).toBeInTheDocument();

    // Back closes the URL state; no stale intent may keep the dialog open.
    state.query = {
      settingsBoardId: null,
      settingsDialog: null,
      settingsLinkedProvider: null,
      settingsTab: null,
    };
    rerender();
    expect(screen.queryByRole('dialog')).toBeNull();

    state.lazyComponent = () => <div data-testid="settings-dialog" />;
    rerender();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('settings-dialog')).toBeNull();
  });
});
