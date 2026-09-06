import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TasksRouteProvider } from '../tu-do/tasks-route-context';
import { TaskCalendarPageShell } from './task-calendar-page-shell';

vi.mock('@tuturuuu/ui/calendar-app/calendar-page-shell', () => ({
  CalendarPageShell: () => <div>calendar content</div>,
}));
vi.mock('../tu-do/shared/task-dialog-wrapper', () => ({
  TaskDialogWrapper: ({
    children,
    routePrefix,
  }: {
    children: ReactNode;
    routePrefix: string;
  }) => (
    <div data-testid="dialog" data-prefix={routePrefix}>
      {children}
    </div>
  ),
}));
vi.mock('./components/calendar-header-actions', () => ({
  CalendarHeaderActions: () => null,
}));
vi.mock('./components/tasks-sidebar', () => ({ default: () => null }));

const props = {
  workspace: { id: 'workspace-1' },
  userId: 'user-1',
  locale: 'en',
  calendarConnections: [],
  enableSmartScheduling: true,
  isPersonalWorkspace: false,
} as unknown as ComponentProps<typeof TaskCalendarPageShell>;

describe('calendar task routing', () => {
  it('uses the host task route prefix for task dialogs', () => {
    render(
      <TasksRouteProvider prefix="">
        <TaskCalendarPageShell {...props} />
      </TasksRouteProvider>
    );
    expect(screen.getByTestId('dialog').getAttribute('data-prefix')).toBe('');
  });
  it('reuses an existing dialog provider in Tasks', () => {
    render(<TaskCalendarPageShell {...props} manageTaskDialog={false} />);
    expect(screen.queryByTestId('dialog')).toBeNull();
    expect(screen.getByText('calendar content')).toBeTruthy();
  });
});
