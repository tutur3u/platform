import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarHeaderDateProvider } from '@tuturuuu/ui/legacy/calendar/calendar-header-new-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  addEmptyEvent: vi.fn(),
  invalidateQueries: vi.fn(),
  readOnly: false,
  actorId: 'user-1',
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => state,
}));
vi.mock('@tuturuuu/ui/legacy/calendar/settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: { timezone: { timezone: 'Asia/Ho_Chi_Minh' } },
  }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/legacy/calendar/native-recurrence-dialog', () => ({
  NativeRecurrenceDialog: ({ open }: { open: boolean }) =>
    open ? <div>recurrence-dialog</div> : null,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => ({ actorId: state.actorId }),
}));
vi.mock('./quick-task-dialog', () => ({
  QuickTaskDialog: ({
    open,
    userId,
    isPersonalWorkspace,
  }: {
    open: boolean;
    userId?: string;
    isPersonalWorkspace?: boolean;
  }) =>
    open ? (
      <div data-user-id={userId} data-personal={String(isPersonalWorkspace)}>
        task-dialog
      </div>
    ) : null,
}));
vi.mock('../../tu-do/habits/habit-form-dialog', () => ({
  default: ({ open, onSuccess }: { open: boolean; onSuccess: () => void }) =>
    open ? (
      <button type="button" onClick={onSuccess}>
        habit-dialog
      </button>
    ) : null,
}));
vi.mock('./experimental-feature-dialog', () => ({
  ExperimentalFeatureDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        acknowledge-experimental
      </button>
    ) : null,
}));
vi.mock('./smart-schedule-preview-panel', () => ({
  SmartSchedulePreviewPanel: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>smart-schedule-preview</div> : null,
}));

import { CalendarHeaderActions } from './calendar-header-actions';
import { smartScheduleStep } from './smart-schedule-button';

function renderActions(viewed = new Date(2026, 10, 20)) {
  render(
    <CalendarHeaderDateProvider value={viewed}>
      <CalendarHeaderActions workspaceId="ws-1" enableSmartScheduling />
    </CalendarHeaderDateProvider>
  );
}

function openMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'new_menu.more' }), {
    key: 'Enter',
  });
}

beforeEach(() => {
  state.readOnly = false;
  state.actorId = 'user-1';
  state.addEmptyEvent.mockClear();
  state.invalidateQueries.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  // 10:10 in Ho Chi Minh City.
  vi.setSystemTime(new Date('2026-11-14T03:10:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarHeaderActions', () => {
  it('opens the event modal at the next half hour on the viewed day', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'new-event' }));
    expect(state.addEmptyEvent).toHaveBeenCalledTimes(1);
    const start = state.addEmptyEvent.mock.calls[0]?.[0] as Date;
    expect(start.toISOString()).toBe('2026-11-20T03:30:00.000Z');
  });

  it('offers task, habit, recurring event and smart schedule in the menu', () => {
    renderActions();
    openMenu();
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent)
    ).toEqual([
      'new_menu.task',
      'new_menu.habit',
      'new_menu.recurring_event',
      'new_menu.smart_schedule',
    ]);
    // Each item carries its own icon.
    const icons = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('svg')?.getAttribute('class'));
    expect(new Set(icons).size).toBe(4);
  });

  it('opens the matching dialog for each menu item', () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'new_menu.task' }));
    expect(screen.getByText('task-dialog')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'new_menu.habit' }));
    expect(screen.getByText('habit-dialog')).toBeTruthy();
    expect(screen.queryByText('task-dialog')).toBeNull();

    openMenu();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'new_menu.recurring_event' })
    );
    expect(screen.getByText('recurrence-dialog')).toBeTruthy();
  });

  it('assigns new tasks with the same rule as the Plan panel', () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'new_menu.task' }));
    const dialog = screen.getByText('task-dialog');
    expect(dialog.getAttribute('data-user-id')).toBe('user-1');
    expect(dialog.getAttribute('data-personal')).toBe('false');
  });

  it('marks the personal workspace when it belongs to the actor', () => {
    state.actorId = 'ws-1';
    renderActions();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'new_menu.task' }));
    const dialog = screen.getByText('task-dialog');
    expect(dialog.getAttribute('data-user-id')).toBe('ws-1');
    expect(dialog.getAttribute('data-personal')).toBe('true');
  });

  it('refreshes the habits list after a habit is created', () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'new_menu.habit' }));
    fireEvent.click(screen.getByText('habit-dialog'));
    expect(state.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['habits', 'ws-1'],
    });
    expect(screen.queryByText('habit-dialog')).toBeNull();
  });

  it('opens the smart-schedule preview after the experimental warning', () => {
    renderActions();
    openMenu();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'new_menu.smart_schedule' })
    );
    expect(screen.queryByText('smart-schedule-preview')).toBeNull();
    fireEvent.click(screen.getByText('acknowledge-experimental'));
    expect(screen.getByText('smart-schedule-preview')).toBeTruthy();
  });

  it('disables Event and Recurring event on read-only calendars', () => {
    state.readOnly = true;
    renderActions();
    const primary = screen.getByRole('button', { name: 'new-event' });
    expect((primary as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(primary);
    expect(state.addEmptyEvent).not.toHaveBeenCalled();

    openMenu();
    expect(
      screen
        .getByRole('menuitem', { name: 'new_menu.recurring_event' })
        .getAttribute('aria-disabled')
    ).toBe('true');
    for (const name of ['new_menu.task', 'new_menu.habit']) {
      expect(
        screen.getByRole('menuitem', { name }).getAttribute('aria-disabled')
      ).toBeNull();
    }
  });
});

describe('smartScheduleStep', () => {
  it('asks for acknowledgement once, then previews', () => {
    expect(smartScheduleStep(false, false)).toBe('idle');
    expect(smartScheduleStep(true, false)).toBe('confirming');
    expect(smartScheduleStep(true, true)).toBe('previewing');
    expect(smartScheduleStep(false, true)).toBe('idle');
  });
});
