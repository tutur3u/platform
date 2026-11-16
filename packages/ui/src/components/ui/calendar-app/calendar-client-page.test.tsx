import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ needsCalendarGate: false }));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('./hooks', () => ({
  useCalendarSettings: () => ({
    initialSettings: {},
    needsCalendarGate: settings.needsCalendarGate,
  }),
}));
vi.mock('./components/require-workspace-timezone-dialog', () => ({
  RequireWorkspaceTimezoneDialog: ({ onCompleted }: { onCompleted: () => void }) => (
    <button type="button" onClick={onCompleted}>Complete timezone setup</button>
  ),
}));
vi.mock('@tuturuuu/ui/legacy/calendar/smart-calendar', () => ({
  SmartCalendar: ({ extras }: { extras: ReactNode }) => <div>{extras}</div>,
}));
vi.mock('./components/calendar-connections-unified', () => ({
  default: ({ variant }: { variant: string }) => (
    <div data-testid="sync-entry">{variant}</div>
  ),
}));

import { CalendarClientPage } from './calendar-client-page';

const workspace = { id: 'workspace' } as Workspace;
const HeaderActions = () => <span>Calendar actions</span>;

describe('calendar sync warning placement', () => {
  beforeEach(() => { settings.needsCalendarGate = false; });
  afterEach(cleanup);

  it('blocks automatic creation until timezone setup completes', () => {
    settings.needsCalendarGate = true;
    const Actions = ({ creationBlocked }: { creationBlocked?: boolean }) => (
      <span>{creationBlocked ? 'Creation blocked' : 'Creation ready'}</span>
    );
    render(<CalendarClientPage workspace={workspace} HeaderActions={Actions} enableSmartScheduling={false} />);
    expect(screen.getByText('Creation blocked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete timezone setup' }));
    expect(screen.getByText('Creation ready')).toBeTruthy();
  });
  it('keeps a header recovery entry when Calendar uses its sidebar for calendar selection', () => {
    render(
      <CalendarClientPage
        workspace={workspace}
        HeaderActions={HeaderActions}
        enableSmartScheduling={false}
        showConnectionsManager={false}
      />
    );
    expect(screen.getByTestId('sync-entry').textContent).toBe('status');
    expect(screen.getByText('Calendar actions')).toBeTruthy();
  });
  it('lets the normal calendar picker own recovery in the embedded Tasks calendar', () => {
    render(
      <CalendarClientPage
        workspace={workspace}
        HeaderActions={HeaderActions}
        enableSmartScheduling={false}
        showConnectionsManager
      />
    );
    expect(screen.queryByTestId('sync-entry')).toBeNull();
  });
});
