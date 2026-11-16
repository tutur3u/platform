// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const calendarConfig = vi.hoisted(() => ({
  url: 'https://calendar.example.test',
}));

vi.mock('next-intl', async () => {
  const messages = (await import('../../../../../../messages/en.json'))
    .default as Record<string, unknown>;
  const lookup = (path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        messages
      );
  return {
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (key: string) =>
      String(lookup(`${namespace}.${key}`) ?? `${namespace}.${key}`),
  };
});
vi.mock('@tuturuuu/icons', () => {
  const Icon = () => null;
  return {
    Calendar: Icon,
    ChevronRight: Icon,
    Ellipsis: Icon,
    ExternalLink: Icon,
    Loader2: Icon,
    Pencil: Icon,
    Search: Icon,
    Trash2: Icon,
    Video: Icon,
    X: Icon,
  };
});
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: ComponentProps<'button'> & { asChild?: boolean }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock('@tuturuuu/ui/dropdown-menu', () => {
  const Part = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Part,
    DropdownMenuContent: () => null,
    DropdownMenuItem: Part,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Part,
  };
});
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/toggle-group', () => ({
  ToggleGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ToggleGroupItem: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/constants/common', () => ({
  get CALENDAR_URL() {
    return calendarConfig.url;
  },
}));
vi.mock('@/features/call/components/meeting-local-time', () => ({
  useMeetingTimeZone: () => 'UTC',
}));
vi.mock('@/features/call/components/meeting-room-action', () => ({
  MeetingRoomAction: ({ meetingId }: { meetingId: string }) => (
    <span data-testid="room-action">{meetingId}</span>
  ),
}));

import { MeetingsHome } from './meetings-home';
import { UpcomingSection } from './upcoming-section';
import { DEFAULT_PAST_CHOICE } from './section-rules';
import type {
  CurrentMeetings,
  MeetingsHomeSchedule,
  PastCollapseChoice,
  PastController,
  OlderMeetings,
  ScheduledMeeting,
} from './types';

const NOW = '2026-03-10T12:00:00.000Z';

function meeting(id: string, time: string): ScheduledMeeting {
  return {
    calendar: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    creatorId: 'account-a',
    id,
    name: `Meeting ${id}`,
    time,
  };
}

const upcoming = [meeting('next', '2026-03-11T09:00:00.000Z')];
const past = [meeting('done', '2026-03-09T09:00:00.000Z')];

function schedule(current: CurrentMeetings): MeetingsHomeSchedule {
  return {
    ...current,
    calendarAccess: { status: 'unavailable' },
    evaluatedAt: NOW,
    past,
    upcoming,
    viewerTimezone: { source: 'browser', timeZone: null },
  };
}

function Harness({
  current = { current: [], currentSource: 'unavailable' },
  onChoiceChange = () => {},
  pastMeetings = past,
  older = { kind: 'complete' },
  filter = 'all',
  onLoadOlder = () => {},
}: {
  current?: CurrentMeetings;
  onChoiceChange?: (choice: PastCollapseChoice) => void;
  pastMeetings?: ScheduledMeeting[];
  older?: OlderMeetings;
  filter?: PastController['filter'];
  onLoadOlder?: () => void;
}) {
  const [choice, setChoice] = useState<PastCollapseChoice>(DEFAULT_PAST_CHOICE);
  const controller: PastController = {
    choice,
    count: { loaded: pastMeetings.length, more: older.kind !== 'complete' },
    filter,
    onChoiceChange: (next) => {
      setChoice(next);
      onChoiceChange(next);
    },
    onFilterChange: () => {},
    onLoadOlder,
    onRetry: () => {},
    onSearchChange: () => {},
    results: { kind: 'ready', meetings: pastMeetings, older },
    search: '',
  };
  return (
    <MeetingsHome
      accountId="account-a"
      management={{ onDelete: () => {}, onEdit: () => {} }}
      onRetry={() => {}}
      past={controller}
      state={{ kind: 'ready', schedule: schedule(current), sync: 'fresh' }}
      wsId="workspace-1"
    />
  );
}

afterEach(() => {
  cleanup();
  calendarConfig.url = 'https://calendar.example.test';
});

describe('Meetings home sections', () => {
  it.each([
    ['https://calendar.example.test', '/workspace-1'],
    ['https://calendar.example.test/calendar', '/calendar/workspace-1'],
    ['https://calendar.example.test/calendar/', '/calendar/workspace-1'],
  ])('preserves the Calendar base path for %s', (base, pathname) => {
    calendarConfig.url = base;
    render(
      <UpcomingSection
        accountId="account-a"
        calendarAccess={{ status: 'available' }}
        management={{ onDelete: () => {}, onEdit: () => {} }}
        meetings={[]}
        now={NOW}
        timeZone="UTC"
        wsId="workspace-1"
      />
    );
    expect(
      screen.getByRole('link', { name: 'Open Calendar' }).getAttribute('href')
    ).toBe(`https://calendar.example.test${pathname}`);
  });

  it('loads older meetings when the fetched page has no past meetings', () => {
    const onLoadOlder = vi.fn();
    render(
      <Harness
        onLoadOlder={onLoadOlder}
        older={{ kind: 'available' }}
        pastMeetings={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Past/ }));
    expect(screen.getByText('No past meetings')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older meetings' })
    );
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });

  it('loads older meetings when Mine filters out the fetched past meetings', () => {
    const onLoadOlder = vi.fn();
    render(
      <Harness
        filter="mine"
        onLoadOlder={onLoadOlder}
        older={{ kind: 'available' }}
        pastMeetings={[
          {
            ...meeting('other', '2026-03-09T09:00:00.000Z'),
            creatorId: 'another-account',
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Past/ }));
    expect(screen.getByText('No past meetings match')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older meetings' })
    );
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });

  it('keeps Past collapsed by default and mounts no past rows', () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: /Past/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Meeting done')).toBeNull();
    expect(screen.getByText('Meeting next')).toBeTruthy();
  });

  it('expands and collapses Past from a keyboard-operable disclosure', () => {
    const onChoiceChange = vi.fn();
    render(<Harness onChoiceChange={onChoiceChange} />);
    const toggle = screen.getByRole('button', { name: /Past/ });
    // A native button activates on Enter and Space by dispatching click.
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    );
    expect(panel?.textContent).toContain('Meeting done');
    expect(onChoiceChange).toHaveBeenLastCalledWith('expanded');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Meeting done')).toBeNull();
    expect(onChoiceChange).toHaveBeenLastCalledWith('collapsed');
  });

  it('hides Current when no presence source is available', () => {
    render(<Harness />);
    expect(screen.queryByText('Happening now')).toBeNull();
  });

  it('shows Current with a join action for presence-reported meetings', () => {
    render(
      <Harness
        current={{
          current: [
            {
              ...meeting('00000000-0000-4000-8000-000000000001', NOW),
              participantCount: 3,
              viewerJoined: true,
            },
          ],
          currentSource: 'presence',
        }}
      />
    );
    expect(screen.getByText('Happening now')).toBeTruthy();
    const join = screen.getByText('Rejoin').closest('a');
    expect(join?.getAttribute('href')).toMatch(/^\/r\//);
  });
});
