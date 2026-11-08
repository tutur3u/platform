import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleMonthEditor } from './schedule-month-editor';

const mocks = vi.hoisted(() => ({
  cloneTopicScheduleMonth: vi.fn(),
  getTopicScheduleMonth: vi.fn(),
  push: vi.fn(),
  saveTopicScheduleMonth: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && 'count' in values ? `${key}:${values.count}` : key,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@tuturuuu/internal-api/topic-announcements', () => ({
  cloneTopicScheduleMonth: mocks.cloneTopicScheduleMonth,
  getTopicScheduleMonth: mocks.getTopicScheduleMonth,
  saveTopicScheduleMonth: mocks.saveTopicScheduleMonth,
  TopicScheduleSaveRejectedError: class extends Error {},
}));

function session(overrides: Record<string, unknown>) {
  return {
    classLabel: 'K1',
    durationMinutes: 30,
    endTime: '18:00',
    groupId: 'k1',
    gvnnContactId: 'anna',
    hasTopic: false,
    id: 's1',
    place: 'A',
    room: '101',
    sentAt: null,
    sessionDate: '2026-11-10',
    startTime: '17:30',
    status: 'draft',
    teacherWorkspaceUserId: 't1',
    ...overrides,
  };
}

function renderEditor(onMonthChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <a href="/ws-1/users/topic-announcements/delivery">delivery</a>
      <ScheduleMonthEditor
        month="2026-11"
        onMonthChange={onMonthChange}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
  return { onMonthChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTopicScheduleMonth.mockResolvedValue({
    data: {
      classes: [
        {
          id: 'k1',
          name: 'K1',
          primaryTeacherId: 't1',
          teachers: [{ id: 't1', name: 'Thu' }],
        },
        { id: 'k2', name: 'K2', primaryTeacherId: null, teachers: [] },
      ],
      gvnnContacts: [
        { email: 'a@x.test', id: 'anna', isGvnn: true, name: 'Anna' },
      ],
      sessions: [
        session({}),
        session({
          gvnnContactId: null,
          groupId: 'k2',
          id: 's2',
          sessionDate: '2026-11-12',
        }),
        session({
          gvnnContactId: null,
          groupId: 'k2',
          id: 's3',
          sessionDate: '2026-11-26',
        }),
      ],
    },
  });
  mocks.saveTopicScheduleMonth.mockResolvedValue({
    data: {
      createdIds: [],
      deletedIds: [],
      existingIds: [],
      updatedIds: ['s1'],
    },
  });
});

/** Pretends this tab has (index > 0) or lacks an earlier page. */
function setHistoryIndex(index: number) {
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: { currentEntry: { index } },
  });
}

/** What a browser does on Back: land on the entry below, then popstate. */
function browserBack() {
  window.history.replaceState(null, '', window.location.href);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

async function editFirstRoom() {
  await screen.findByText('schedule_session_count:3');
  fireEvent.change(screen.getAllByLabelText('schedule_column_room')[0]!, {
    target: { value: '202' },
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let back: ReturnType<typeof vi.spyOn>;
let push: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setHistoryIndex(1);
  back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  push = vi.spyOn(window.history, 'pushState');
});

afterEach(() => {
  back.mockRestore();
  push.mockRestore();
});

describe('unsaved-changes guard', () => {
  it('goes back past the extra entry after confirming Back', async () => {
    renderEditor();
    await editFirstRoom();
    browserBack();
    fireEvent.click(
      await screen.findByRole('button', { name: 'schedule_discard_confirm' })
    );
    // First the extra entry is popped...
    expect(back).toHaveBeenCalledTimes(1);
    browserBack();
    await flush();
    // ...then Back continues to the earlier page.
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('pops the extra entry before following a confirmed link', async () => {
    renderEditor();
    await editFirstRoom();
    fireEvent.click(screen.getByText('delivery'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'schedule_discard_confirm' })
    );
    expect(back).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    browserBack();
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/ws-1/users/topic-announcements/delivery'
      )
    );
  });

  it('pops the extra entry before a confirmed month change', async () => {
    const { onMonthChange } = renderEditor();
    await editFirstRoom();
    fireEvent.click(
      screen.getByRole('button', { name: 'schedule_next_month' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'schedule_discard_confirm' })
    );
    expect(onMonthChange).not.toHaveBeenCalled();
    browserBack();
    await waitFor(() => expect(onMonthChange).toHaveBeenCalledWith('2026-12'));
  });

  it('drops the extra entry when edits are discarded in place', async () => {
    renderEditor();
    await editFirstRoom();
    fireEvent.click(screen.getByRole('button', { name: 'schedule_discard' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'schedule_discard_confirm' })
    );
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });

  it('ignores a multi-step jump that lands on another page', async () => {
    renderEditor();
    await editFirstRoom();
    const href = window.location.href;
    window.history.replaceState(null, '', '/elsewhere');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'schedule_discard_confirm' })
    ).toBeNull();
    window.history.replaceState(null, '', href);
  });

  it('does not trap Back when there is no earlier page', async () => {
    setHistoryIndex(0);
    renderEditor();
    await editFirstRoom();
    expect(push).not.toHaveBeenCalled();
    browserBack();
    await flush();
    expect(
      screen.queryByRole('button', { name: 'schedule_discard_confirm' })
    ).toBeNull();
  });
});

describe('row order', () => {
  it('keeps rows in saved order while a start time is typed', async () => {
    mocks.getTopicScheduleMonth.mockResolvedValueOnce({
      data: {
        classes: [],
        gvnnContacts: [],
        sessions: [
          session({ id: 'a', room: 'A', startTime: '17:30' }),
          session({ id: 'b', room: 'B', startTime: '18:00' }),
        ],
      },
    });
    renderEditor();
    const starts = await screen.findAllByLabelText('schedule_column_start');
    fireEvent.change(starts[0]!, { target: { value: '19:00' } });
    const rooms = screen.getAllByLabelText('schedule_column_room');
    expect(rooms.map((input) => (input as HTMLInputElement).value)).toEqual([
      'A',
      'B',
    ]);
  });
});
