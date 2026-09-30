import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarPreferencesProvider } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AddTaskForm } from './add-task-form';
import { saveTaskDefaults } from './utils/task-defaults';

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useBoardConfig: () => ({ data: null }),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false }),
}));
vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@tuturuuu/ui/date-time-picker', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/ui/date-time-picker')
  >('@tuturuuu/ui/date-time-picker');
  return {
    ...actual,
    DateTimePicker: (props: ComponentProps<typeof actual.DateTimePicker>) =>
      props.minDate ? (
        <actual.DateTimePicker
          {...props}
          date={props.date ?? new Date('2026-10-01T04:00:00Z')}
          inline
        />
      ) : (
        <button
          type="button"
          onClick={() => props.setDate?.(new Date('2026-10-01T03:00:00Z'))}
        >
          Set start October 1 at 10:00
        </button>
      ),
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('the actual AddTaskForm offers due times after the configured-zone start in a different browser zone', async () => {
  vi.stubEnv('TZ', 'America/Los_Angeles');
  // Every API request stays synthetic; this fixture never creates a task.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] }))
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['boards-with-lists', 'workspace'], {
    boards: [
      {
        id: 'board',
        name: 'Board',
        task_lists: [{ id: 'list', name: 'List' }],
      },
    ],
  });
  client.setQueryData(['workspace_labels', 'workspace'], []);
  client.setQueryData(['workspace_projects', 'workspace'], []);
  saveTaskDefaults('workspace', 'board', 'list');
  render(
    <QueryClientProvider client={client}>
      <CalendarPreferencesProvider
        value={{ timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' }}
      >
        <AddTaskForm
          wsId="workspace"
          defaultTaskName="Synthetic task"
          setOpen={vi.fn()}
          setIsLoading={vi.fn()}
        />
      </CalendarPreferencesProvider>
    </QueryClientProvider>
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Next: Add Details' })
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Set start October 1 at 10:00' })[0]!
  );
  const comboboxes = screen.getAllByRole('combobox');
  fireEvent.keyDown(
    comboboxes.find((element) => element.textContent?.includes('11:00'))!,
    { key: 'Enter' }
  );
  expect(screen.getByRole('option', { name: '10:15' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '09:45' })).toBeNull();
});
