// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { STANDARD_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { teachers, sessions, actor } = vi.hoisted(() => ({
  teachers: vi.fn(),
  sessions: vi.fn(),
  actor: { current: { actorId: 'actor-A', assertActive: () => {} } },
}));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  listTutoringTeachers: (...args: unknown[]) => teachers(...args),
  listTutoringSessions: (...args: unknown[]) => sessions(...args),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => actor.current,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.days ? `${key}:${values.days}` : key,
}));

import { TutoringDraftChoices } from './tutoring-draft-choices';
import { DEFAULT_FORM, type TutoringFormValues } from './tutoring-types';

const scheduled = [
  {
    id: 'class',
    groupId: 'group',
    status: 'scheduled',
    startsAt: '2030-01-07T11:00:00Z',
    startTimezone: 'Asia/Ho_Chi_Minh',
  },
] as WorkspaceUserGroupSession[];
const response = (data: unknown[]) => ({
  data,
  count: data.length,
  page: 1,
  pageSize: 100,
  totalPages: data.length ? 1 : 0,
});
function mount(
  schedule = scheduled,
  missingCount = 0,
  missingAbsenceDate = false
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Fixture({ ws }: { ws: string }) {
    const [form, setForm] = useState<TutoringFormValues>({
      ...DEFAULT_FORM,
      groupId: 'group',
      studentUserId: 'learner',
      missedClassDate: missingAbsenceDate ? '' : '2030-01-01',
      reasonType: missingAbsenceDate ? 'ABSENT_RECOVERY' : 'CUSTOM',
      sessionSlots: [
        {
          sessionDate: '',
          startTime: '',
          durationMinutes: 45,
          teacherUserId: '',
        },
      ],
    });
    return (
      <>
        <input
          aria-label="draft content"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
        <output aria-label="draft">{JSON.stringify(form)}</output>
        <TutoringDraftChoices
          wsId={ws}
          form={form}
          policy={STANDARD_TUTORING_POLICY}
          today="2030-01-01"
          schedule={schedule}
          missingCount={missingCount}
          onChange={setForm}
        />
      </>
    );
  }
  const view = (ws: string) => (
    <QueryClientProvider client={client}>
      <Fixture ws={ws} />
    </QueryClientProvider>
  );
  const result = render(view('workspace-A'));
  return {
    ...result,
    workspace: (ws: string) => result.rerender(view(ws)),
    client,
  };
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  actor.current = { actorId: 'actor-A', assertActive: () => {} };
  teachers.mockResolvedValue(
    response([
      { id: 'teacher-a', full_name: 'Synthetic teacher A', display_name: null },
      { id: 'teacher-b', full_name: 'Synthetic teacher B', display_name: null },
    ])
  );
  sessions.mockResolvedValue(response([]));
});
describe('actual scoped draft choice UI', () => {
  it('does not offer configured but unmaterialized occurrences as confirmed classes', () => {
    mount([], 3);
    expect(screen.getByText('plan_missing_schedule')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'plan_schedule' })
    ).toBeInTheDocument();
    expect(teachers).not.toHaveBeenCalled();
  });

  it('loads complete workspace data and applies only an explicit teacher choice without writing', async () => {
    mount();
    await screen.findByRole('button', { name: 'Synthetic teacher A' });
    expect(
      JSON.parse(screen.getByLabelText('draft').textContent!).sessionSlots[0]
        .teacherUserId
    ).toBe('');
    expect(sessions).toHaveBeenCalledWith(
      'workspace-A',
      expect.objectContaining({
        page: 1,
        pageSize: 100,
        fromDate: '2029-12-31',
        toDate: '2030-02-26',
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Synthetic teacher A' })
    );
    expect(
      JSON.parse(screen.getByLabelText('draft').textContent!).sessionSlots[0]
    ).toEqual({
      sessionDate: '2030-01-07',
      startTime: '17:15',
      durationMinutes: 45,
      teacherUserId: 'teacher-a',
    });
  });
  it('removes teacher with a known overlapping workspace reservation', async () => {
    sessions.mockResolvedValue(
      response([
        {
          id: 'busy',
          teacher_user_id: 'teacher-a',
          student_user_id: 'other',
          session_date: '2030-01-07',
          start_time: '17:30',
          duration_minutes: 45,
          attendance_status: 'PENDING',
        },
      ])
    );
    mount();
    await screen.findByRole('button', { name: 'Synthetic teacher B' });
    expect(
      screen.queryByRole('button', { name: 'Synthetic teacher A' })
    ).not.toBeInTheDocument();
  });
  it('shows policy horizon and actionable class schedule instead of fake fallback', () => {
    mount([]);
    expect(screen.getByText('plan_no_schedule:56')).toHaveTextContent(
      'plan_no_schedule:56'
    );
    expect(screen.getByRole('link', { name: 'plan_schedule' })).toHaveAttribute(
      'href',
      '/en/workspace-A/users/groups/group/schedule'
    );
    expect(teachers).not.toHaveBeenCalled();
  });
  it('distinguishes no eligible teachers from incomplete reads', async () => {
    teachers.mockResolvedValue(response([]));
    mount();
    await screen.findByText('plan_no_teachers');
    expect(
      screen.queryByRole('button', { name: 'Synthetic teacher A' })
    ).not.toBeInTheDocument();
  });
  it('shows safe error and retries incomplete catalog without silently offering choices', async () => {
    teachers.mockResolvedValue({ ...response([]), count: 101, totalPages: 2 });
    mount();
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('plan_incomplete');
    teachers.mockResolvedValue(
      response([
        {
          id: 'teacher-a',
          full_name: 'Synthetic teacher A',
          display_name: null,
        },
      ])
    );
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByRole('button', { name: 'Synthetic teacher A' });
  });
  it('held catalog does not overwrite newer staff draft edits', async () => {
    let release!: (value: unknown) => void;
    teachers.mockReturnValue(
      new Promise((r) => {
        release = r;
      })
    );
    mount();
    fireEvent.change(screen.getByLabelText('draft content'), {
      target: { value: 'newer staff edit' },
    });
    await act(async () =>
      release(
        response([
          {
            id: 'teacher-a',
            full_name: 'Synthetic teacher A',
            display_name: null,
          },
        ])
      )
    );
    await screen.findByRole('button', { name: 'Synthetic teacher A' });
    expect(screen.getByLabelText('draft content')).toHaveValue(
      'newer staff edit'
    );
    expect(
      JSON.parse(screen.getByLabelText('draft').textContent!).sessionSlots[0]
        .sessionDate
    ).toBe('');
  });
  it('denies old actor lifetime held results after actor ABA', async () => {
    let active = true;
    actor.current = {
      actorId: 'actor-A',
      assertActive: () => {
        if (!active) throw new Error('departed');
      },
    };
    let release!: (value: unknown) => void;
    teachers.mockReturnValue(
      new Promise((r) => {
        release = r;
      })
    );
    const view = mount();
    await waitFor(() => expect(teachers).toHaveBeenCalled());
    active = false;
    actor.current = { actorId: 'actor-B', assertActive: () => {} };
    view.workspace('workspace-B');
    actor.current = { actorId: 'actor-A', assertActive: () => {} };
    view.workspace('workspace-A');
    await act(async () =>
      release(
        response([
          {
            id: 'teacher-a',
            full_name: 'Synthetic teacher A',
            display_name: null,
          },
        ])
      )
    );
    expect(
      screen.queryByRole('button', { name: 'Synthetic teacher A' })
    ).not.toBeInTheDocument();
  });

  it('shows lookup failures without raw server messages or inferred empty teacher choices', async () => {
    teachers.mockRejectedValue(new Error('Synthetic private provider body'));
    mount();
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('plan_incomplete');
    expect(
      screen.queryByText('Synthetic private provider body')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('plan_no_teachers')).not.toBeInTheDocument();
  });
  it('rejects held data from a departed workspace without requesting old-scope sessions', async () => {
    let release!: (value: unknown) => void;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    teachers.mockImplementation((ws: string) =>
      ws === 'workspace-A' ? held : Promise.resolve(response([]))
    );
    const view = mount();
    await waitFor(() => expect(teachers).toHaveBeenCalled());
    view.workspace('workspace-B');
    await screen.findByText('plan_no_teachers');
    await act(async () =>
      release(
        response([
          {
            id: 'teacher-a',
            full_name: 'Synthetic teacher A',
            display_name: null,
          },
        ])
      )
    );
    expect(
      screen.queryByRole('button', { name: 'Synthetic teacher A' })
    ).not.toBeInTheDocument();
    expect(sessions.mock.calls.every(([ws]) => ws === 'workspace-B')).toBe(
      true
    );
  });
  it('keeps manual absence-date admission before proposing or loading teachers', () => {
    mount(scheduled, 0, true);
    expect(screen.getByText('plan_choose_missed_date')).toBeInTheDocument();
    expect(teachers).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Synthetic teacher A' })
    ).not.toBeInTheDocument();
  });
});
