import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('ScheduleMonthEditor', () => {
  it('counts sessions that still need a GVNN and lists them by class', async () => {
    renderEditor();
    expect(await screen.findByText('schedule_session_count:3')).toBeTruthy();
    const panel = screen.getByRole('region', { name: 'schedule_needs_gvnn' });
    expect(within(panel).getByText('K2')).toBeTruthy();
    expect(within(panel).getAllByRole('button')).toHaveLength(2);
    // K2 has no TEACHER member: both of its sessions show no GVCN.
    expect(screen.getAllByText('schedule_needs_gvcn')).toHaveLength(2);
    expect(screen.getByText('Thu')).toBeTruthy();
  });

  it('filters the list to sessions without a GVNN', async () => {
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    expect(screen.getAllByLabelText('schedule_column_room')).toHaveLength(3);
    fireEvent.click(
      screen.getByRole('button', {
        pressed: false,
        name: /schedule_needs_gvnn/,
      })
    );
    expect(screen.getAllByLabelText('schedule_column_room')).toHaveLength(2);
  });

  it('saves only the edited session', async () => {
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    fireEvent.change(screen.getAllByLabelText('schedule_column_room')[0]!, {
      target: { value: '202' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'schedule_save_changes:1' })
    );
    await waitFor(() =>
      expect(mocks.saveTopicScheduleMonth).toHaveBeenCalled()
    );
    expect(mocks.saveTopicScheduleMonth).toHaveBeenCalledWith('ws-1', {
      deleteIds: [],
      month: '2026-11',
      sessions: [
        expect.objectContaining({ durationMinutes: 30, id: 's1', room: '202' }),
      ],
    });
  });

  it("shows a new row's problems only after a save attempt", async () => {
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    fireEvent.click(
      screen.getByRole('button', { name: 'schedule_add_session' })
    );
    expect(screen.queryByText('schedule_issue_missing_class')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'schedule_save_changes:1' })
    );
    expect(screen.getByText('schedule_issue_missing_class')).toBeTruthy();
    expect(mocks.saveTopicScheduleMonth).not.toHaveBeenCalled();
  });

  it('marks an invalid field and links it to its message', async () => {
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    const minutes = screen.getAllByLabelText('schedule_column_minutes')[0]!;
    fireEvent.change(minutes, { target: { value: '0' } });
    expect(minutes.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(
      minutes.getAttribute('aria-describedby') ?? ''
    );
    expect(message?.textContent).toContain('schedule_issue_invalid_duration');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks before going Back with unsaved changes', async () => {
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    fireEvent.change(screen.getAllByLabelText('schedule_column_room')[0]!, {
      target: { value: '202' },
    });
    // What a browser does on Back: land on the previous entry, then popstate.
    window.history.replaceState(null, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(
      await screen.findByRole('button', { name: 'schedule_discard_confirm' })
    ).toBeTruthy();
  });

  it('keeps one guard entry while editing, even with an unstable router', async () => {
    const back = vi.spyOn(window.history, 'back');
    const push = vi.spyOn(window.history, 'pushState');
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    const room = screen.getAllByLabelText('schedule_column_room')[0]!;
    fireEvent.change(room, { target: { value: '202' } });
    fireEvent.change(room, { target: { value: '203' } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'schedule_discard_confirm' })
    ).toBeNull();
    back.mockRestore();
    push.mockRestore();
  });

  it('labels sessions in delivery by their state', async () => {
    mocks.getTopicScheduleMonth.mockResolvedValueOnce({
      data: {
        classes: [],
        gvnnContacts: [],
        sessions: [
          session({ id: 'q', status: 'queued' }),
          session({ id: 'p', startTime: '18:00', status: 'processing' }),
        ],
      },
    });
    renderEditor();
    expect(await screen.findByText('schedule_locked_queued')).toBeTruthy();
    expect(screen.getByText('schedule_locked_sending')).toBeTruthy();
  });

  it('asks before leaving the month with unsaved changes', async () => {
    const { onMonthChange } = renderEditor();
    await screen.findByText('schedule_session_count:3');
    fireEvent.change(screen.getAllByLabelText('schedule_column_room')[0]!, {
      target: { value: '202' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'schedule_next_month' })
    );
    expect(onMonthChange).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'schedule_discard_confirm' })
    );
    expect(onMonthChange).toHaveBeenCalledWith('2026-12');
  });

  it('previews the clone before committing it', async () => {
    mocks.cloneTopicScheduleMonth.mockImplementation(
      async (_ws, { dryRun }) => ({
        data: {
          createdIds: dryRun ? [] : ['n1'],
          items: [
            {
              classLabel: 'K1',
              endTime: '18:00',
              gvnnContactId: 'anna',
              reason: null,
              sourceDate: '2026-10-13',
              sourceId: 'o1',
              startTime: '17:30',
              status: 'create',
              targetDate: '2026-11-10',
              teacherWorkspaceUserId: 't1',
              weekday: 2,
              weekdayOccurrence: 2,
            },
          ],
        },
      })
    );
    renderEditor();
    await screen.findByText('schedule_session_count:3');
    fireEvent.click(
      screen.getByRole('button', { name: 'schedule_clone_previous' })
    );
    const confirm = await screen.findByRole('button', {
      name: 'schedule_clone_confirm:1',
    });
    expect(mocks.cloneTopicScheduleMonth).toHaveBeenCalledWith('ws-1', {
      dryRun: true,
      sourceMonth: '2026-10',
      targetMonth: '2026-11',
    });
    await waitFor(() =>
      expect((confirm as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.cloneTopicScheduleMonth).toHaveBeenCalledWith('ws-1', {
        dryRun: false,
        includeRemoved: false,
        sourceMonth: '2026-10',
        targetMonth: '2026-11',
      })
    );
  });
});
