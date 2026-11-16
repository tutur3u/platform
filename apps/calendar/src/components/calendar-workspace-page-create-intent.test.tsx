// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));

vi.mock('@tuturuuu/tasks-ui/calendar/task-calendar-page-shell', () => ({
  TaskCalendarPageShell: (props: Record<string, unknown>) => {
    captured.props = props;
    return null;
  },
}));
vi.mock('@tuturuuu/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./calendar-navigation-provider', () => ({
  useCalendarNavigation: () => ({
    date: new Date('2026-11-16T00:00:00Z'),
    setDate: vi.fn(),
    setView: vi.fn(),
    view: 'week',
    timezone: 'UTC',
  }),
}));
vi.mock('./calendar-header-actions-with-create-intent', () => ({
  CalendarHeaderActionsWithCreateIntent: function CreateIntentHeaderActions() {
    return null;
  },
}));

import { CalendarHeaderActionsWithCreateIntent } from './calendar-header-actions-with-create-intent';
import { CalendarWorkspacePage } from './calendar-workspace-page';

describe('CalendarWorkspacePage create-intent composition', () => {
  it('renders the create-intent header actions inside the calendar shell, keeping event links', () => {
    render(
      <CalendarWorkspacePage
        {...({
          enableSmartScheduling: true,
          initialEventId: 'event-1',
          isPersonalWorkspace: false,
          locale: 'en',
          smartSchedulingTasks: [],
          userId: 'user-1',
          workspace: { id: 'ws-1' },
        } as unknown as ComponentProps<typeof CalendarWorkspacePage>)}
      />
    );

    expect(captured.props?.HeaderActions).toBe(CalendarHeaderActionsWithCreateIntent);
    // The Next page and the native Start view both render this component.
    expect(captured.props?.initialEventId).toBe('event-1');
  });
});
