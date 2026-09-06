import { render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('./hooks', () => ({
  useCalendarSettings: () => ({
    initialSettings: {},
    needsCalendarGate: false,
  }),
}));
vi.mock('./components/require-workspace-timezone-dialog', () => ({
  RequireWorkspaceTimezoneDialog: () => null,
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
