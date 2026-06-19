// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SmartCalendar } from './smart-calendar';

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  CalendarProvider: ({
    children,
    eventAdapter,
  }: {
    children: ReactNode;
    eventAdapter?: { disableBuiltInEventUi?: boolean };
  }) => (
    <div
      data-adapter={eventAdapter ? 'true' : 'false'}
      data-testid="calendar-provider"
    >
      {children}
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  CalendarSyncProvider: ({
    children,
    externalEvents,
  }: {
    children: ReactNode;
    externalEvents?: unknown[];
  }) => (
    <div
      data-external-events={externalEvents?.length ?? 0}
      data-testid="calendar-sync-provider"
    >
      {children}
    </div>
  ),
}));

vi.mock('./settings/settings-context', () => ({
  CalendarSettingsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="settings-provider">{children}</div>
  ),
}));

vi.mock('./calendar-content', () => ({
  CalendarContent: ({
    disableBuiltInEventUi,
    extras,
  }: {
    disableBuiltInEventUi?: boolean;
    extras?: ReactNode;
  }) => (
    <div
      data-disable-built-in-ui={disableBuiltInEventUi ? 'true' : 'false'}
      data-testid="calendar-content"
    >
      <div data-testid="header-extras">{extras}</div>
    </div>
  ),
}));

vi.mock('../../calendar-app/components/calendar-connections-unified', () => ({
  default: ({ wsId }: { wsId: string }) => (
    <span data-testid="connections-manager">{wsId}</span>
  ),
}));

const baseProps = {
  locale: 'en',
  t: (key: string) => key,
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
};

describe('SmartCalendar', () => {
  it('renders the compact connections manager before existing header extras', () => {
    render(
      <SmartCalendar
        {...baseProps}
        workspace={{ id: 'workspace-1' } as Workspace}
        extras={<span data-testid="custom-extra">extra</span>}
      />
    );

    expect(screen.getByTestId('connections-manager').textContent).toBe(
      'workspace-1'
    );
    expect(
      Array.from(screen.getByTestId('header-extras').children).map((element) =>
        element.getAttribute('data-testid')
      )
    ).toEqual(['connections-manager', 'custom-extra']);
  });

  it('keeps existing header extras when the manager is disabled', () => {
    render(
      <SmartCalendar
        {...baseProps}
        workspace={{ id: 'workspace-1' } as Workspace}
        disabled
        showConnectionsManager={false}
        extras={<span data-testid="custom-extra">extra</span>}
      />
    );

    expect(screen.queryByTestId('connections-manager')).toBeNull();
    expect(screen.getByTestId('custom-extra').textContent).toBe('extra');
  });

  it('passes custom event adapters and external events through the calendar shell', () => {
    render(
      <SmartCalendar
        {...baseProps}
        workspace={{ id: 'workspace-1' } as Workspace}
        showConnectionsManager={false}
        eventAdapter={{ disableBuiltInEventUi: true }}
        externalEvents={[
          {
            id: 'session-1',
            title: 'Class',
            start_at: '2026-06-19T12:00:00.000Z',
            end_at: '2026-06-19T13:00:00.000Z',
          },
        ]}
      />
    );

    expect(screen.getByTestId('calendar-sync-provider')).toHaveAttribute(
      'data-external-events',
      '1'
    );
    expect(screen.getByTestId('calendar-provider')).toHaveAttribute(
      'data-adapter',
      'true'
    );
    expect(screen.getByTestId('calendar-content')).toHaveAttribute(
      'data-disable-built-in-ui',
      'true'
    );
  });
});
