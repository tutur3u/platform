/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/tasks/messages/en.json';
import { TaskRecurrenceRow } from './task-recurrence-row';
import { useQuickCreateRecurrence } from './use-quick-create-recurrence';
import { useCreateTaskRecurrence } from './use-task-recurrence';

const api = vi.hoisted(() => ({
  prepareWorkspaceTaskRecurrence: vi.fn(),
  prepareWorkspaceTaskRecurrenceTask: vi.fn(),
  readWorkspaceTaskRecurrence: vi.fn(),
  createWorkspaceTaskRecurrence: vi.fn(),
  editWorkspaceTaskRecurrence: vi.fn(),
  setWorkspaceTaskRecurrenceStatus: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/task-recurrence', () => ({
  ...api,
  TASK_RECURRENCE_READ_LIMIT: 100,
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({ timezone: 'Asia/Ho_Chi_Minh' }),
}));

const TASK = '11111111-1111-4111-8111-111111111111';
const SERIES = '22222222-2222-4222-8222-222222222222';

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const form = {
  name: 'Weekly review',
  description: null,
  priority: null,
  estimationPoints: null,
  startDate: undefined,
  endDate: new Date('2026-11-21T16:59:59.999Z'),
  selectedListId: '33333333-3333-4333-8333-333333333333',
  selectedLabels: [],
  selectedProjects: [],
  selectedAssignees: [],
  setName: vi.fn(),
  setDescription: vi.fn(),
} as unknown as Parameters<typeof useQuickCreateRecurrence>[0]['form'];

const quickCreate = (
  overrides: Partial<Parameters<typeof useQuickCreateRecurrence>[0]> = {}
) =>
  renderHook(
    () =>
      useQuickCreateRecurrence({
        wsId: 'ws-1',
        boardId: 'board-1',
        form,
        compactCreate: true,
        saveAsDraft: false,
        createMultiple: false,
        onUpdate: vi.fn(),
        onClose: vi.fn(),
        ...overrides,
      }),
    { wrapper }
  );

beforeEach(() => {
  api.readWorkspaceTaskRecurrence.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Repeat eligibility', () => {
  it('offers no Repeat while dormant or for a non-member', async () => {
    api.prepareWorkspaceTaskRecurrence.mockResolvedValue(null);
    const { result } = quickCreate();
    await waitFor(() =>
      expect(api.prepareWorkspaceTaskRecurrence).toHaveBeenCalledWith(
        'ws-1',
        form.selectedListId
      )
    );
    expect(result.current.chip).toBeNull();
    expect(result.current.createRecurringTask).toBeUndefined();
  });

  it('offers Repeat when the API admits the actor', async () => {
    api.prepareWorkspaceTaskRecurrence.mockResolvedValue('receipt');
    const { result } = quickCreate();
    await waitFor(() => expect(result.current.chip).not.toBeNull());
    expect(result.current.chip?.timing.requestedDate).toBe('2026-11-21');
    // No choice yet, so saving keeps the plain create path.
    expect(result.current.createRecurringTask).toBeUndefined();
  });

  it('never asks for drafts or relationship creation', () => {
    quickCreate({ saveAsDraft: true });
    quickCreate({ parentTaskId: TASK });
    quickCreate({
      pendingRelationships: {
        parentTask: null,
        childTasks: [],
        blockingTasks: [{ id: TASK, name: 'Blocker' }],
        blockedByTasks: [],
        relatedTasks: [],
      } as never,
    });
    expect(api.prepareWorkspaceTaskRecurrence).not.toHaveBeenCalled();
  });
});

describe('TaskRecurrenceRow', () => {
  it('renders nothing for a task without a readable series', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <TaskRecurrenceRow wsId="ws-1" task={{ id: TASK }} form={form} />,
      { wrapper }
    );
    await waitFor(() =>
      expect(api.readWorkspaceTaskRecurrence).toHaveBeenCalledWith('ws-1', [
        TASK,
      ])
    );
    expect(container).toBeEmptyDOMElement();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('labels the series and keeps edits local by default', async () => {
    const entry = {
      task_id: TASK,
      series_id: SERIES,
      occurrence_date: '2026-11-21',
      state: 'active',
      revision: 1,
      progress: 0,
    };
    const template = {
      ...entry,
      rule: {
        version: 1,
        frequency: 'weekly',
        interval: 1,
        timeZone: 'Asia/Ho_Chi_Minh',
        weekdays: ['SA'],
        end: { type: 'never' },
      },
      anchor_date: '2026-11-21',
      due_time: null,
      start_offset_days: 0,
      template: {
        title: 'Old title',
        description: null,
        priority: null,
        estimate: null,
        labels: [],
        projects: [],
        assignees: [],
      },
    };
    api.readWorkspaceTaskRecurrence.mockImplementation(
      async (_ws: string, _ids: string[], includeTemplate?: boolean) =>
        includeTemplate ? [template] : [entry]
    );
    api.prepareWorkspaceTaskRecurrenceTask.mockResolvedValue('receipt');
    api.editWorkspaceTaskRecurrence.mockResolvedValue({ series_id: SERIES });

    const { rerender } = render(
      <TaskRecurrenceRow wsId="ws-1" task={{ id: TASK }} form={form} />,
      { wrapper }
    );

    expect(
      await screen.findByRole('img', {
        name: 'Repeating task, Weekly on Sat',
      })
    ).toBeInTheDocument();
    // Fields that already differed when the task opened do not prompt.
    expect(
      screen.queryByTestId('task-recurrence-scope-prompt')
    ).not.toBeInTheDocument();

    const edited = { ...form, name: 'Weekly review v2' } as typeof form;
    rerender(
      <TaskRecurrenceRow wsId="ws-1" task={{ id: TASK }} form={edited} />
    );
    expect(screen.getByRole('radio', { name: 'Only this task' })).toBeChecked();

    fireEvent.click(
      screen.getByRole('radio', { name: 'This and following tasks' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(api.editWorkspaceTaskRecurrence).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          seriesId: SERIES,
          taskId: TASK,
          revision: 1,
          receipt: 'receipt',
          spec: {
            // Re-anchored after this task, on the series' own next date.
            schedule: expect.objectContaining({ anchorDate: '2026-11-28' }),
            template: expect.objectContaining({ title: 'Weekly review v2' }),
          },
        })
      )
    );
  });
});

describe('useCreateTaskRecurrence', () => {
  it('replays a lost attempt with the same receipt', async () => {
    api.prepareWorkspaceTaskRecurrence.mockResolvedValue('receipt-1');
    api.createWorkspaceTaskRecurrence
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ series_id: SERIES });
    const { result } = renderHook(
      () => useCreateTaskRecurrence('ws-1', 'board-1'),
      { wrapper }
    );
    const input = { listId: 'list-1', spec: { schedule: {}, template: {} } };
    await expect(result.current.mutateAsync(input as never)).rejects.toThrow(
      'network'
    );
    await result.current.mutateAsync(input as never);
    expect(api.prepareWorkspaceTaskRecurrence).toHaveBeenCalledTimes(1);
    expect(api.createWorkspaceTaskRecurrence).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({ receipt: 'receipt-1' })
    );
  });
});
