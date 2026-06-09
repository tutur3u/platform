// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SmartCalendar } from './smart-calendar';

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  CalendarProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="calendar-provider">{children}</div>
  ),
}));

vi.mock('./settings/settings-context', () => ({
  CalendarSettingsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="settings-provider">{children}</div>
  ),
}));

vi.mock('./calendar-content', () => ({
  CalendarContent: ({ extras }: { extras?: ReactNode }) => (
    <div data-testid="calendar-content">
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
});
