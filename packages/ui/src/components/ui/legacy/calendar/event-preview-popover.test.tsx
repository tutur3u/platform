import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { CalendarPreferencesProvider } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useState } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EventPreviewPopover } from './event-preview-popover';
import { formatEventPreviewTime } from './event-preview-time';

type ToastOptions = {
  action: { label: string; onClick: () => void };
  onAutoClose: () => void;
  onDismiss: () => void;
};

const state = vi.hoisted(() => ({
  event: {} as Record<string, unknown>,
  open: true,
  setOpen: (_open: boolean) => {},
  readOnly: false,
  closePreview: vi.fn(),
  openEventEditor: vi.fn(),
  deleteEvent: vi.fn(),
  patchVisibleEvents: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    previewEvent: state.open ? state.event : undefined,
    isPreviewOpen: state.open,
    closePreview: state.closePreview,
    openEventEditor: state.openEventEditor,
    deleteEvent: state.deleteEvent,
    getEvents: () => [state.event],
    isModalOpen: false,
    readOnly: state.readOnly,
    isEventReadOnly: (event: CalendarEvent) => Boolean(event.seriesId),
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({ patchVisibleEvents: state.patchVisibleEvents }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: state.toast }));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; 'data-testid'?: string }) => (
    <span role="img" aria-label={alt} data-testid={props['data-testid']} />
  ),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => `t:${key}`,
}));

const baseEvent = {
  id: 'synthetic-event',
  title: 'Synthetic timezone regression',
  color: 'BLUE',
  start_at: '2026-09-30T11:00:00Z',
  end_at: '2026-09-30T13:00:00Z',
};

function Harness({
  anchored = true,
  initiallyOpen = false,
}: {
  anchored?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  state.open = open;
  state.setOpen = setOpen;
  return (
    <CalendarPreferencesProvider value={{ timezone: 'UTC', timeFormat: '24h' }}>
      <button
        type="button"
        data-calendar-event-id={anchored ? 'synthetic-event' : 'other'}
        onClick={() => setOpen(true)}
      >
        card
      </button>
      <EventPreviewPopover />
    </CalendarPreferencesProvider>
  );
}

function renderOpen(event: Record<string, unknown> = {}) {
  state.event = { ...baseEvent, ...event };
  return render(<Harness anchored={false} initiallyOpen />);
}

function lastToast() {
  return state.toast.mock.calls.at(-1) as [string, ToastOptions];
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  state.readOnly = false;
  state.closePreview.mockImplementation(() => state.setOpen(false));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('event preview popover', () => {
  it('opens anchored to the clicked event and returns focus on close', async () => {
    state.event = { ...baseEvent };
    render(<Harness />);
    const card = screen.getByRole('button', { name: 'card' });
    card.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 40,
        right: 140,
        bottom: 160,
        width: 100,
        height: 60,
      }) as DOMRect;

    card.focus();
    fireEvent.click(card);

    const dialog = await screen.findByRole('dialog', {
      name: 'Synthetic timezone regression',
    });
    expect(dialog).toHaveFocus();
    // Anchored previews sit beside the event (jsdom has no viewport, so the
    // collision flip may pick either side); the corner fallback opens below.
    expect(['left', 'right']).toContain(dialog.getAttribute('data-side'));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(state.closePreview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(card).toHaveFocus();
  });

  it('falls back to the corner when the event is not on screen', async () => {
    state.event = { ...baseEvent };
    render(<Harness anchored={false} />);
    // jsdom elements have no layout, so the clicked element has no visible rect.
    fireEvent.click(screen.getByRole('button', { name: 'card' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Synthetic timezone regression',
    });
    expect(['top', 'bottom']).toContain(dialog.getAttribute('data-side'));
    expect(dialog).toHaveAttribute('data-align', 'end');
  });

  it('gives icon buttons accessible names and translated labels', () => {
    renderOpen({ title: '' });
    expect(screen.getByRole('dialog', { name: 't:untitled' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 't:close' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 't:delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 't:edit' })).toBeTruthy();
  });

  it('hides delete and shows read-only once for read-only calendars', () => {
    state.readOnly = true;
    renderOpen({ locked: true });
    expect(screen.queryByRole('button', { name: 't:delete' })).toBeNull();
    expect(screen.getAllByText('t:read_only')).toHaveLength(1);
    expect(screen.queryByRole('img', { name: 't:locked' })).toBeNull();
  });

  it('hides delete for recurring occurrences', () => {
    renderOpen({ seriesId: 'series-1' });
    expect(screen.queryByRole('button', { name: 't:delete' })).toBeNull();
  });

  it('shows the provider once', () => {
    renderOpen({ provider: 'google', google_calendar_id: 'team@example.com' });
    expect(screen.getAllByTestId('google-calendar-logo')).toHaveLength(1);
    expect(screen.getByText('team@example.com')).toBeTruthy();
    expect(screen.queryByText(/^google$/i)).toBeNull();
  });

  it('names the provider calendar once when it has no calendar name', () => {
    renderOpen({ provider: 'microsoft' });
    expect(screen.getAllByText(/Microsoft Outlook/)).toHaveLength(1);
    expect(screen.queryByTestId('microsoft-outlook-logo')).toBeNull();
  });
});

describe('event preview delete with undo', () => {
  it('hides the event, and undo restores it without calling the API', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 't:delete' }));

    expect(state.closePreview).toHaveBeenCalled();
    expect(state.patchVisibleEvents).toHaveBeenCalledWith([], {
      removeIds: ['synthetic-event'],
    });
    const [message, options] = lastToast();
    expect(message).toBe('t:deleted');
    expect(options.action.label).toBe('t:undo');

    options.action.onClick();
    options.onDismiss();
    options.onAutoClose();

    expect(state.patchVisibleEvents).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 'synthetic-event',
        title: baseEvent.title,
      }),
    ]);
    expect(state.deleteEvent).not.toHaveBeenCalled();
  });

  it('commits through the existing delete path when the toast closes', async () => {
    state.deleteEvent.mockResolvedValue(undefined);
    renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 't:delete' }));
    const [, options] = lastToast();

    await act(async () => options.onAutoClose());

    expect(state.deleteEvent).toHaveBeenCalledTimes(1);
    expect(state.deleteEvent).toHaveBeenCalledWith('synthetic-event');
    options.action.onClick();
    expect(state.patchVisibleEvents).toHaveBeenCalledTimes(1);
  });

  it('restores the event and reports when the delete fails', async () => {
    state.deleteEvent.mockRejectedValue(new Error('offline'));
    renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 't:delete' }));
    const [, options] = lastToast();

    await act(async () => options.onAutoClose());

    expect(state.patchVisibleEvents).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'synthetic-event' }),
    ]);
    expect(state.toast.error).toHaveBeenCalledWith('t:delete_failed');
  });
});

it.each([false, true])(
  'preview swatch selects provider/inherited intent: %s',
  (inherited) => {
    renderOpen({
      _calendarColor: '#ff80ab',
      scheduling_metadata: {
        google_color: { version: 1, inherited, background: '#00ff88' },
      },
    });
    expect(screen.getByTestId('event-preview-swatch')).toHaveStyle({
      backgroundColor: inherited ? '#ff80ab' : '#00ff88',
    });
  }
);

describe('calendar quick preview timezone', () => {
  it('renders the actual preview in the calendar zone and 24-hour preference', () => {
    state.event = { ...baseEvent };
    state.open = true;
    render(
      <CalendarPreferencesProvider
        value={{ timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' }}
      >
        <EventPreviewPopover />
      </CalendarPreferencesProvider>
    );
    expect(screen.getByText('Wed, Sep 30 - 18:00 - 20:00')).toBeTruthy();
  });

  it('compares calendar dates in the selected zone across midnight', () => {
    expect(
      formatEventPreviewTime(
        '2026-09-30T16:30:00Z',
        '2026-09-30T18:30:00Z',
        { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' },
        'en-US'
      )
    ).toBe('Wed, Sep 30, 23:30 - Thu, Oct 1, 01:30');
  });
  it('projects each instant independently across a DST gap', () => {
    expect(
      formatEventPreviewTime(
        '2026-03-08T06:30:00Z',
        '2026-03-08T07:30:00Z',
        { timezone: 'America/New_York', timeFormat: '24h' },
        'en-US'
      )
    ).toBe('Sun, Mar 8 - 01:30 - 03:30');
  });

  it('accepts Unicode whitespace in Intl twelve-hour labels', () => {
    const original:
      | TypedPropertyDescriptor<Intl.DateTimeFormat['format']>
      | undefined = Object.getOwnPropertyDescriptor(
      Intl.DateTimeFormat.prototype,
      'format'
    );
    if (!original?.get) throw new Error('Intl formatter getter unavailable');
    const getFormat = original.get;
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
      ...original,
      get(this: Intl.DateTimeFormat): Intl.DateTimeFormat['format'] {
        const formatter = getFormat.call(this);
        const unicodeFormat: Intl.DateTimeFormat['format'] = (date) =>
          formatter(date).replace(/\s(?=[AP]M)/gu, '\u202f');
        return unicodeFormat;
      },
    });
    try {
      const value = formatEventPreviewTime(
        '2026-09-30T11:00:00Z',
        '2026-09-30T13:00:00Z',
        { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '12h' },
        'en-US'
      );
      expect(value).toContain('06:00\u202fPM');
      expect(value).toMatch(/06:00\s+PM/u);
      expect(value).toMatch(/08:00\s+PM/u);
    } finally {
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', original);
    }
  });
  it('uses the supported locale and twelve-hour clock', () => {
    const value = formatEventPreviewTime(
      '2026-09-30T11:00:00Z',
      '2026-09-30T13:00:00Z',
      { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '12h' },
      'en-US'
    );
    expect(value).toMatch(/06:00\s+PM/u);
    expect(value).toMatch(/08:00\s+PM/u);
    expect(
      formatEventPreviewTime(
        '2026-09-30T11:00:00Z',
        '2026-09-30T13:00:00Z',
        { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' },
        'vi'
      )
    ).toContain('18:00');
  });
});
