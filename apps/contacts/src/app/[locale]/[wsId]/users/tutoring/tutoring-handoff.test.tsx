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
import { STANDARD_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { schedule, policy, actor } = vi.hoisted(() => ({
  schedule: vi.fn(),
  policy: vi.fn(),
  actor: { current: { actorId: 'synthetic-actor', assertActive: () => {} } },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceUserGroupSessions: (...args: unknown[]) => schedule(...args),
  listAllWorkspaceUserGroups: async () => [],
  listTutoringSessions: async () => ({ data: [], count: 0 }),
  createTutoringSession: vi.fn(),
  markTutoringSession: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  getTutoringPolicy: (...args: unknown[]) => policy(...args),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => {
  return { useWorkspaceActor: () => actor.current };
});
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('nuqs', async () => {
  const { useState } = await import('react');
  const parser = {
    withDefault: (value: unknown) => ({ withOptions: () => ({ value }) }),
  };
  return {
    parseAsString: parser,
    parseAsInteger: parser,
    useQueryState: (_: string, p: { value: unknown }) => useState(p.value),
  };
});
vi.mock('@tuturuuu/icons', () => ({
  CalendarClock: () => null,
  LifeBuoy: () => null,
  Settings2: () => null,
  CalendarPlus: () => null,
  Loader2: () => null,
  TriangleAlert: () => null,
}));
vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({ default: () => null }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@tuturuuu/ui/tabs', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Tabs: Box, TabsContent: Box, TabsList: Box, TabsTrigger: Box };
});
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button {...props} />
  ),
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/label', () => ({
  Label: (props: ComponentProps<'label'>) => <label {...props} />,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({ Combobox: () => null }));
vi.mock('./tutoring-people-picker', () => ({
  WorkspacePersonPicker: () => null,
}));
vi.mock('./tutoring-create-slots', () => ({
  TutoringCreateSlots: ({ form }: { form: { sessionSlots: unknown[] } }) => (
    <output aria-label="suggested slots">
      {JSON.stringify(form.sessionSlots)}
    </output>
  ),
}));
vi.mock('./tutoring-overview', () => ({ TutoringOverview: () => null }));
vi.mock('./tutoring-policy-card', () => ({ TutoringPolicyCard: () => null }));
const item = (id: string) => ({
  group_id: id,
  student_user_id: id,
  student_name: id,
  reason_type: 'ABSENT_RECOVERY',
  absence_deficit: 1,
  missed_class_dates: ['2030-01-03', '2030-01-01'],
  feedback_content: '',
  source_feedback_id: null,
});
vi.mock('./tutoring-queue-card', () => ({
  TutoringQueueCard: ({
    actions,
  }: {
    actions: { onSchedule: (i: ReturnType<typeof item>) => void };
  }) => (
    <>
      <button type="button" onClick={() => actions.onSchedule(item('A'))}>
        queue A
      </button>
      <button type="button" onClick={() => actions.onSchedule(item('B'))}>
        queue B
      </button>
    </>
  ),
}));
vi.mock('./tutoring-sessions-card', async () => {
  const { TutoringCreateCard } = await import('./tutoring-create-card');
  return {
    TutoringSessionsCard: ({
      actions,
      create,
      policy: currentPolicy,
      wsId,
    }: {
      actions: {
        onCreateDialogOpenChange: (open: boolean) => void;
        onCreateFormChange: ComponentProps<
          typeof TutoringCreateCard
        >['onChange'];
      };
      create: {
        open: boolean;
        form: ComponentProps<typeof TutoringCreateCard>['form'];
      };
      policy: ComponentProps<typeof TutoringCreateCard>['policy'];
      wsId: string;
    }) => (
      <>
        <button
          type="button"
          onClick={() => actions.onCreateDialogOpenChange(true)}
        >
          new draft
        </button>
        <button
          type="button"
          onClick={() => actions.onCreateDialogOpenChange(false)}
        >
          close draft
        </button>
        {create.open && (
          <div role="dialog">
            <output aria-label="student">{create.form.studentUserId}</output>
            <TutoringCreateCard
              form={create.form}
              groups={[]}
              students={[]}
              policy={currentPolicy}
              wsId={wsId}
              isSubmitting={false}
              onSubmit={() => {}}
              onChange={actions.onCreateFormChange}
            />
          </div>
        )}
      </>
    ),
  };
});

import { TutoringClient } from './tutoring-client';

function held() {
  let release!: (value: unknown) => void;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function mount(wsId = 'workspace-A', canManage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = (ws: string) => (
    <QueryClientProvider client={client}>
      <TutoringClient wsId={ws} canManage={canManage} canConfigure={false} />
    </QueryClientProvider>
  );
  const result = render(view(wsId));
  return {
    ...result,
    changeWorkspace: (ws: string) => result.rerender(view(ws)),
    client,
  };
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  policy.mockResolvedValue({ policy: STANDARD_TUTORING_POLICY });
  schedule.mockResolvedValue({ data: [] });
});
describe('actual tutoring queue handoff', () => {
  it('prefills the oldest supplied missed date in the actual create card', async () => {
    mount();
    fireEvent.click(screen.getByText('queue A'));
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('missed_class_date')).toHaveValue(
      '2030-01-01'
    );
  });
  it('newer queue selection wins over held older results', async () => {
    const old = held();
    schedule.mockImplementation((_ws: string, p: { groupId: string }) =>
      p.groupId === 'A' ? old.promise : Promise.resolve({ data: [] })
    );
    mount();
    fireEvent.click(screen.getByText('queue A'));
    fireEvent.click(screen.getByText('queue B'));
    await waitFor(() =>
      expect(screen.getByLabelText('student')).toHaveTextContent('B')
    );
    await act(async () => old.release({ data: [] }));
    expect(screen.getByLabelText('student')).toHaveTextContent('B');
  });
  it('does not open old workspace results after departure and return', async () => {
    const old = held();
    schedule.mockReturnValue(old.promise);
    const view = mount();
    fireEvent.click(screen.getByText('queue A'));
    view.changeWorkspace('workspace-B');
    view.changeWorkspace('workspace-A');
    await act(async () => old.release({ data: [] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('closing a manually opened draft cancels a held queue handoff', async () => {
    const old = held();
    schedule.mockReturnValue(old.promise);
    mount();
    fireEvent.click(screen.getByText('queue A'));
    fireEvent.click(screen.getByText('new draft'));
    fireEvent.click(screen.getByText('close draft'));
    await act(async () => old.release({ data: [] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('preserves edits made while queue data is held', async () => {
    const old = held();
    schedule.mockReturnValue(old.promise);
    mount();
    fireEvent.click(screen.getByText('new draft'));
    fireEvent.click(screen.getByText('queue A'));
    fireEvent.change(screen.getByLabelText('content'), {
      target: { value: 'Synthetic newer draft' },
    });
    await act(async () => old.release({ data: [] }));
    expect(screen.getByLabelText('content')).toHaveValue(
      'Synthetic newer draft'
    );
  });
  it('does not publish after unmount', async () => {
    const old = held();
    schedule.mockReturnValue(old.promise);
    const view = mount();
    fireEvent.click(screen.getByText('queue A'));
    view.unmount();
    await act(async () => old.release({ data: [] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('rejects a departed actor lifetime even after the same actor returns', async () => {
    const old = held();
    schedule.mockReturnValue(old.promise);
    let active = true;
    actor.current = {
      actorId: 'actor-A',
      assertActive: () => {
        if (!active) throw new Error('departed');
      },
    };
    const view = mount();
    fireEvent.click(screen.getByText('queue A'));
    active = false;
    actor.current = { actorId: 'actor-B', assertActive: () => {} };
    view.changeWorkspace('workspace-A');
    actor.current = { actorId: 'actor-A', assertActive: () => {} };
    view.changeWorkspace('workspace-A');
    await act(async () => old.release({ data: [] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('does not request schedules without management admission', async () => {
    mount('workspace-A', false);
    fireEvent.click(screen.getByText('queue A'));
    await act(async () => {});
    expect(schedule).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('retains staff custom policy when applying same-scope suggestions', async () => {
    const custom = {
      ...STANDARD_TUTORING_POLICY,
      preset: 'custom',
      timeRules: [
        {
          weekdays: [1],
          classStartTime: '18:00',
          tutoringStartTime: '19:00',
          durationMinutes: 25,
        },
      ],
    };
    policy.mockResolvedValue({ policy: custom });
    schedule.mockResolvedValue({
      data: [
        {
          startsAt: '2030-01-07T11:00:00Z',
          startTimezone: 'Asia/Ho_Chi_Minh',
          status: 'scheduled',
        },
      ],
    });
    const view = mount();
    await waitFor(() =>
      expect(
        view.client.getQueryData(['tutoring-policy', 'workspace-A'])
      ).toEqual({ policy: custom })
    );
    fireEvent.click(screen.getByText('queue A'));
    await screen.findByRole('dialog');
    expect(
      JSON.parse(screen.getByLabelText('suggested slots').textContent!)
    ).toEqual([
      {
        durationMinutes: 25,
        sessionDate: '2030-01-07',
        startTime: '19:00',
        teacherUserId: '',
      },
    ]);
    expect(screen.getByLabelText('missed_class_date')).toHaveValue(
      '2030-01-01'
    );
  });
});
