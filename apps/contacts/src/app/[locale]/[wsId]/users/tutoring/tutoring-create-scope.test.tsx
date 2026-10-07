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

const { schedule, policy, actor, create, success, failure } = vi.hoisted(
  () => ({
    schedule: vi.fn(),
    policy: vi.fn(),
    create: vi.fn(),
    success: vi.fn(),
    failure: vi.fn(),
    actor: { current: { actorId: 'synthetic-actor', assertActive: () => {} } },
  })
);
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceUserGroupSessions: (...args: unknown[]) => schedule(...args),
  listAllWorkspaceUserGroups: async () => [],
  listTutoringSessions: async () => ({ data: [], count: 0 }),
  createTutoringSession: (...args: unknown[]) => create(...args),
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
  toast: { success, error: failure },
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
  TutoringCreateSlots: ({
    form,
    onChange,
  }: {
    form: ComponentProps<
      typeof import('./tutoring-create-card').TutoringCreateCard
    >['form'];
    onChange: (
      form: ComponentProps<
        typeof import('./tutoring-create-card').TutoringCreateCard
      >['form']
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          ...form,
          sessionSlots: [
            {
              sessionDate: '2030-01-04',
              startTime: '14:00',
              durationMinutes: 45,
              teacherUserId: 'synthetic-teacher',
            },
          ],
        })
      }
    >
      Fill valid slot
    </button>
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
        onCreate: () => void;
        onCreateFormChange: ComponentProps<
          typeof TutoringCreateCard
        >['onChange'];
      };
      create: {
        open: boolean;
        isSubmitting: boolean;
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
              isSubmitting={create.isSubmitting}
              onSubmit={actions.onCreate}
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
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function currentActor(id: string) {
  let active = true;
  return {
    actorId: id,
    assertActive: () => {
      if (!active) throw new Error('Synthetic expired actor');
    },
    expire: () => {
      active = false;
    },
  };
}
function mount(wsId = 'workspace-A') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = (ws: string) => (
    <QueryClientProvider client={client}>
      <TutoringClient wsId={ws} canManage={true} canConfigure={false} />
    </QueryClientProvider>
  );
  const result = render(view(wsId));
  return {
    ...result,
    redraw: (ws = wsId) => result.rerender(view(ws)),
    client,
  };
}
async function prepareDraft(queue = 'A') {
  fireEvent.click(screen.getByText(`queue ${queue}`));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Fill valid slot' }));
  fireEvent.change(screen.getByLabelText('content'), {
    target: { value: `Synthetic draft ${queue}` },
  });
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  policy.mockResolvedValue({ policy: STANDARD_TUTORING_POLICY });
  schedule.mockResolvedValue({ data: [] });
  create.mockResolvedValue({
    id: 'synthetic-created',
    ids: ['synthetic-created'],
    createdCount: 1,
  });
  actor.current = currentActor('account-A');
});
describe('actual mounted create completion scope', () => {
  it('current-scope create submits the real card payload and closes only its own draft', async () => {
    mount();
    await prepareDraft();
    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        'workspace-A',
        expect.objectContaining({
          groupId: 'A',
          studentUserId: 'A',
          content: 'Synthetic draft A',
          sessions: [
            {
              sessionDate: '2030-01-04',
              startTime: '14:00',
              durationMinutes: 45,
              teacherUserId: 'synthetic-teacher',
            },
          ],
        })
      )
    );
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('current-scope create rejection remains visible and preserves selected draft', async () => {
    create.mockRejectedValueOnce(new Error('Synthetic failure'));
    mount();
    await prepareDraft();
    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    await waitFor(() =>
      expect(failure).toHaveBeenCalledWith('Synthetic failure')
    );
    expect(screen.getByLabelText('content')).toHaveValue('Synthetic draft A');
  });
  it('guards synchronous duplicate submits and snapshots the admitted payload', async () => {
    const pending = held();
    create.mockReturnValueOnce(pending.promise);
    mount();
    await prepareDraft();
    const button = screen.getByRole('button', { name: 'create' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ content: 'Synthetic draft A' })
    );
    await act(async () => {
      pending.resolve({
        id: 'synthetic-one',
        ids: ['synthetic-one'],
        createdCount: 1,
      });
      await pending.promise;
    });
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
  });
  it('rejects an expired actor lease before dispatch without announcing a save', async () => {
    const initial = currentActor('account-A');
    actor.current = initial;
    mount();
    await prepareDraft();
    initial.expire();
    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(create).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('content')).toHaveValue('Synthetic draft A');
  });
  for (const outcome of ['success', 'error'] as const) {
    it(`new scope can submit while old write is pending; old ${outcome} cannot release new pending owner`, async () => {
      const old = held(),
        newer = held();
      create
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(newer.promise);
      const view = mount();
      await prepareDraft();
      fireEvent.click(screen.getByRole('button', { name: 'create' }));
      await waitFor(() => expect(create).toHaveBeenCalledOnce());
      view.redraw('workspace-B');
      await prepareDraft('B');
      fireEvent.click(screen.getByRole('button', { name: 'create' }));
      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      expect(create.mock.calls[1]?.[0]).toBe('workspace-B');
      await act(async () => {
        if (outcome === 'success')
          old.resolve({
            id: 'synthetic-old',
            ids: ['synthetic-old'],
            createdCount: 1,
          });
        else old.reject(new Error('Synthetic old failure'));
        await old.promise.catch(() => {});
      });
      expect(screen.getByRole('button', { name: 'create' })).toBeDisabled();
      expect(screen.getByLabelText('content')).toHaveValue('Synthetic draft B');
      expect(success).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
      await act(async () => {
        newer.resolve({
          id: 'synthetic-new',
          ids: ['synthetic-new'],
          createdCount: 1,
        });
        await newer.promise;
      });
      await waitFor(() => expect(success).toHaveBeenCalledOnce());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  }
  for (const outcome of ['success', 'error'] as const) {
    it(`replacing a draft in the same scope invalidates old ${outcome} effects and cache invalidation`, async () => {
      const pending = held();
      create.mockReturnValueOnce(pending.promise);
      const view = mount();
      const invalidate = vi.spyOn(view.client, 'invalidateQueries');
      await prepareDraft();
      fireEvent.click(screen.getByRole('button', { name: 'create' }));
      await waitFor(() => expect(create).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByRole('button', { name: 'close draft' }));
      await prepareDraft('B');
      await act(async () => {
        if (outcome === 'success')
          pending.resolve({
            id: 'synthetic-old',
            ids: ['synthetic-old'],
            createdCount: 1,
          });
        else pending.reject(new Error('Synthetic old failure'));
        await pending.promise.catch(() => {});
      });
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'create' })
        ).not.toBeDisabled()
      );
      expect(screen.getByLabelText('content')).toHaveValue('Synthetic draft B');
      expect(success).not.toHaveBeenCalled();
      expect(failure).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });
  }
  for (const scope of ['workspace', 'actor'] as const) {
    for (const outcome of ['success', 'error'] as const) {
      it(`late prior ${scope} ${outcome} cannot clear or announce in a new draft after ABA`, async () => {
        const pending = held();
        create.mockReturnValueOnce(pending.promise);
        const initial = currentActor('account-A');
        actor.current = initial;
        const view = mount();
        await prepareDraft();
        fireEvent.click(screen.getByRole('button', { name: 'create' }));
        await waitFor(() => expect(create).toHaveBeenCalledOnce());
        if (scope === 'workspace') {
          view.redraw('workspace-B');
          view.redraw('workspace-A');
        } else {
          initial.expire();
          actor.current = currentActor('account-B');
          view.redraw();
          actor.current = currentActor('account-A');
          view.redraw();
        }
        await prepareDraft('B');
        await act(async () => {
          if (outcome === 'success')
            pending.resolve({
              id: 'synthetic-old',
              ids: ['synthetic-old'],
              createdCount: 1,
            });
          else pending.reject(new Error('Synthetic old failure'));
          await pending.promise.catch(() => {});
        });
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: 'create' })
          ).not.toBeDisabled()
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText('student')).toHaveTextContent('B');
        expect(screen.getByLabelText('content')).toHaveValue(
          'Synthetic draft B'
        );
        expect(success).not.toHaveBeenCalled();
        expect(failure).not.toHaveBeenCalled();
      });
    }
  }
});
