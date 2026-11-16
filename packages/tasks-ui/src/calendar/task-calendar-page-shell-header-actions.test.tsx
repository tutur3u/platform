import { render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ HeaderActions: undefined as unknown }));

vi.mock('@tuturuuu/ui/calendar-app/calendar-page-shell', () => ({
  CalendarPageShell: (props: { HeaderActions: unknown }) => {
    captured.HeaderActions = props.HeaderActions;
    return null;
  },
}));
vi.mock('../tu-do/shared/task-dialog-wrapper', () => ({
  TaskDialogWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/calendar-header-actions', () => ({
  CalendarHeaderActions: function DefaultHeaderActions() {
    return null;
  },
}));
vi.mock('./components/tasks-sidebar', () => ({ default: () => null }));

import { CalendarHeaderActions } from './components/calendar-header-actions';
import { TaskCalendarPageShell } from './task-calendar-page-shell';

const props = {
  workspace: { id: 'workspace-1' },
  userId: 'user-1',
  locale: 'en',
  calendarConnections: [],
  enableSmartScheduling: true,
  isPersonalWorkspace: false,
  manageTaskDialog: false,
} as unknown as ComponentProps<typeof TaskCalendarPageShell>;

describe('TaskCalendarPageShell header actions', () => {
  beforeEach(() => {
    captured.HeaderActions = undefined;
  });

  it('keeps the standard header actions by default (Tasks app)', () => {
    render(<TaskCalendarPageShell {...props} />);
    expect(captured.HeaderActions).toBe(CalendarHeaderActions);
  });

  it('forwards a host wrapper into the calendar providers (Calendar app)', () => {
    function HostHeaderActions() {
      return null;
    }
    render(<TaskCalendarPageShell {...props} HeaderActions={HostHeaderActions} />);
    expect(captured.HeaderActions).toBe(HostHeaderActions);
  });
});
