import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: {
    settingsDialog: null as string | null,
    settingsTab: null as string | null,
  },
  setQuery: vi.fn(),
  shortcut: vi.fn(),
}));
vi.mock('@/constants/common', () => ({ TTR_URL: 'https://tuturuuu.com' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ wsId: 'personal' }) }));
vi.mock('@tuturuuu/satellite/user-nav-client', () => ({
  default: ({ externalSettingsHost }: { externalSettingsHost?: boolean }) => (
    <div data-testid="responsive-menu">
      {!externalSettingsHost && <div data-testid="menu-settings-owner" />}
    </div>
  ),
}));
vi.mock('nuqs', () => ({
  parseAsString: {},
  parseAsStringLiteral: () => ({}),
  useQueryStates: () => [mocks.query, mocks.setQuery],
}));
vi.mock('@tuturuuu/ui/hooks/use-settings-dialog-shortcut', () => ({
  useSettingsDialogShortcut: mocks.shortcut,
}));
vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
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
    wsId,
    defaultTab,
  }: {
    wsId: string;
    defaultTab?: string;
  }) => {
    const [activeTab] = useState(defaultTab);
    return (
      <div data-testid="settings-content">
        {wsId}:{activeTab ?? 'default'}
      </div>
    );
  },
}));

import CalendarUserNavClient from '@/app/[locale]/user-nav-client';
import { SettingsDialogHost } from './settings-dialog-host';

const user = { id: 'actor' } as WorkspaceUser;
const eventName = 'tuturuuu:settings-dialog-open-intent';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = { settingsDialog: null, settingsTab: null };
});
afterEach(cleanup);
describe('Calendar dedicated settings host', () => {
  it('keeps responsive account-menu factories from owning duplicate dialogs', () => {
    mocks.query = {
      settingsDialog: 'open',
      settingsTab: 'calendar_integrations',
    };
    render(
      <>
        <CalendarUserNavClient user={user} locale="en" />
        <CalendarUserNavClient user={user} locale="en" hideMetadata />
        <SettingsDialogHost user={user} wsId="resolved-workspace" />
      </>
    );
    expect(screen.getAllByTestId('responsive-menu')).toHaveLength(2);
    expect(screen.queryByTestId('menu-settings-owner')).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByTestId('settings-content').textContent).toBe(
      'resolved-workspace:calendar_integrations'
    );
  });
  it('does not mount connection consumers while closed', () => {
    render(<SettingsDialogHost user={user} wsId="resolved-workspace" />);
    expect(screen.queryByTestId('settings-content')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('opens the query-selected tab using the verified workspace and clears it on close', () => {
    mocks.query = {
      settingsDialog: 'open',
      settingsTab: 'calendar_integrations',
    };
    render(<SettingsDialogHost user={user} wsId="resolved-workspace" />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByTestId('settings-content').textContent).toBe(
      'resolved-workspace:calendar_integrations'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mocks.setQuery).toHaveBeenCalledWith({
      settingsDialog: null,
      settingsTab: null,
    });
  });
  it('resets tab-local state when an open intent or workspace identity changes', () => {
    mocks.query = {
      settingsDialog: 'open',
      settingsTab: 'calendar_integrations',
    };
    const view = render(
      <SettingsDialogHost user={user} wsId="workspace-one" />
    );
    mocks.query = { settingsDialog: 'open', settingsTab: 'calendar_hours' };
    view.rerender(<SettingsDialogHost user={user} wsId="workspace-two" />);
    expect(screen.getByTestId('settings-content').textContent).toBe(
      'workspace-two:calendar_hours'
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
  it('claims the menu intent once and unregisters on unmount', () => {
    const view = render(
      <SettingsDialogHost user={user} wsId="resolved-workspace" />
    );
    const intent = new CustomEvent(eventName, {
      cancelable: true,
      detail: { settingsTab: 'calendar_hours' },
    });
    window.dispatchEvent(intent);
    window.dispatchEvent(intent);
    expect(intent.defaultPrevented).toBe(true);
    expect(mocks.setQuery).toHaveBeenCalledTimes(1);
    expect(mocks.setQuery).toHaveBeenCalledWith({
      settingsDialog: 'open',
      settingsTab: 'calendar_hours',
    });
    view.unmount();
    window.dispatchEvent(new CustomEvent(eventName, { cancelable: true }));
    expect(mocks.setQuery).toHaveBeenCalledTimes(1);
  });
  it('uses the common shortcut and declines anonymous settings intents', () => {
    const view = render(
      <SettingsDialogHost user={user} wsId="resolved-workspace" />
    );
    mocks.shortcut.mock.lastCall?.[0].onOpen();
    expect(mocks.setQuery).toHaveBeenCalledWith({
      settingsDialog: 'open',
      settingsTab: null,
    });
    mocks.setQuery.mockClear();
    view.rerender(<SettingsDialogHost user={null} wsId="resolved-workspace" />);
    expect(mocks.shortcut.mock.lastCall?.[0].enabled).toBe(false);
    window.dispatchEvent(new CustomEvent(eventName, { cancelable: true }));
    expect(mocks.setQuery).not.toHaveBeenCalled();
  });
});
