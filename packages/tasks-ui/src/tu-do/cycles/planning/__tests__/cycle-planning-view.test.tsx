import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { toast } from '@tuturuuu/ui/sonner';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CyclePlanningDataSource } from '../cycle-planning-api';
import { CyclePlanningView } from '../cycle-planning-view';
import type { CyclePlanningCycle, CyclePlanningTask } from '../types';
import { ALICE, CYCLES, ME, MYSELF, makeTask } from './fixtures';

type MoveInput = Parameters<CyclePlanningDataSource['moveTask']>[0];

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn() },
}));

const CURRENT_TASKS: CyclePlanningTask[] = [
  makeTask({
    id: 'mine',
    name: 'Ship cycle view',
    status: 'active',
    cycle_id: 'cycle-now',
    assignees: [MYSELF],
  }),
  makeTask({
    id: 'alice',
    name: 'Review copy',
    status: 'active',
    cycle_id: 'cycle-now',
    assignees: [ALICE],
  }),
  makeTask({
    id: 'review',
    name: 'Audit RLS',
    status: 'review',
    cycle_id: 'cycle-now',
  }),
  makeTask({
    id: 'closed',
    name: 'Old spike',
    status: 'closed',
    cycle_id: 'cycle-now',
  }),
];
const BACKLOG_TASKS: CyclePlanningTask[] = [
  makeTask({ id: 'later', name: 'Polish empty states' }),
];

/** An in-memory source whose moves persist, like the real endpoints. */
function makeSource(overrides: Partial<CyclePlanningDataSource> = {}) {
  const store = new Map<string, CyclePlanningTask[]>([
    ['cycle-now', [...CURRENT_TASKS]],
    ['backlog', [...BACKLOG_TASKS]],
  ]);
  const read = (key: string) => [...(store.get(key) ?? [])];
  return {
    listCycleTasks: vi.fn(async (_wsId: string, cycleId: string) =>
      read(cycleId)
    ),
    listBacklogTasks: vi.fn(async (_wsId: string) => read('backlog')),
    moveTask: vi.fn(async ({ taskId, fromCycleId, toCycleId }: MoveInput) => {
      const from = fromCycleId ?? 'backlog';
      const task = read(from).find((item) => item.id === taskId);
      store.set(
        from,
        read(from).filter((item) => item.id !== taskId)
      );
      if (task)
        store.set(toCycleId ?? 'backlog', [
          ...read(toCycleId ?? 'backlog'),
          task,
        ]);
    }),
    ...overrides,
  } satisfies CyclePlanningDataSource;
}

function renderView(
  source: CyclePlanningDataSource,
  cycles: CyclePlanningCycle[] = CYCLES
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CyclePlanningView
        wsId="ws-1"
        currentUserId={ME}
        cycles={cycles}
        source={source}
      />
    </QueryClientProvider>
  );
}

function openMenu(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T09:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('CyclePlanningView', () => {
  it('groups the current cycle by status with counts and Closed collapsed', async () => {
    renderView(makeSource());

    const active = await screen.findByRole('button', { name: /status_active/ });
    expect(active).toHaveTextContent('2');
    expect(active).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: /status_review/ })
    ).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: /status_done/ })).toBeNull();

    const closed = screen.getByRole('button', { name: /status_closed/ });
    expect(closed).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Old spike')).toBeNull();

    fireEvent.click(closed);
    expect(screen.getByText('Old spike')).toBeInTheDocument();

    fireEvent.click(active);
    expect(screen.queryByText('Ship cycle view')).toBeNull();
  });

  it('switches between the current cycle, next and backlog', async () => {
    const source = makeSource();
    renderView(source);
    await screen.findByText('Ship cycle view');

    expect(
      screen.getByRole('radio', { name: 'scope_current' })
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Sprint 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'scope_backlog' }));
    expect(await screen.findByText('Polish empty states')).toBeInTheDocument();
    expect(source.listBacklogTasks).toHaveBeenCalledWith('ws-1');

    fireEvent.click(screen.getByRole('radio', { name: 'scope_next' }));
    expect(screen.getByRole('radio', { name: 'scope_next' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(await screen.findByText('empty_cycle')).toBeInTheDocument();
    expect(source.listCycleTasks).toHaveBeenCalledWith('ws-1', 'cycle-next');
    expect(screen.getByText('Sprint 5')).toBeInTheDocument();
  });

  it('moves focus between rows with the arrow keys', async () => {
    renderView(makeSource());
    const first = await screen.findByRole('link', { name: 'Ship cycle view' });
    first.focus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByRole('link', { name: 'Review copy' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowUp',
    });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('href', '/ws-1/tasks/mine');
  });

  it('shows one line and one action when no cycle is scheduled', async () => {
    renderView(makeSource(), []);
    expect(
      screen.getByRole('radio', { name: 'scope_backlog' })
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'scope_current' }));
    expect(screen.getByText('empty_no_cycle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'manage_cycles' })).toHaveAttribute(
      'href',
      '/ws-1/cycles'
    );
  });

  it('filters by assignee and search, then clears', async () => {
    renderView(makeSource());
    await screen.findByText('Ship cycle view');

    openMenu(screen.getByRole('button', { name: /^assignee/ }));
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'assignee_me' })
    );

    await waitFor(() => expect(screen.queryByText('Review copy')).toBeNull());
    expect(screen.getByText('Ship cycle view')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    fireEvent.click(screen.getByRole('button', { name: 'clear_filters' }));
    expect(await screen.findByText('Review copy')).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'search_placeholder' }),
      {
        target: { value: 'audit' },
      }
    );
    expect(screen.getByText('Audit RLS')).toBeInTheDocument();
    expect(screen.queryByText('Ship cycle view')).toBeNull();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'search_placeholder' }),
      {
        target: { value: 'nothing matches' },
      }
    );
    expect(screen.getByText('empty_filtered')).toBeInTheDocument();
  });

  it('moves a task to the backlog optimistically and rolls back on failure', async () => {
    let reject: (error: Error) => void = () => undefined;
    const source = makeSource({
      moveTask: vi.fn(
        () =>
          new Promise<void>((_resolve, rejectMove) => {
            reject = rejectMove;
          })
      ),
    });
    renderView(source);

    const row = (await screen.findByText('Ship cycle view')).closest('li');
    if (!row) throw new Error('row not rendered');
    openMenu(within(row).getByRole('button', { name: 'task_actions' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'move_to_backlog' })
    );

    await waitFor(() =>
      expect(screen.queryByText('Ship cycle view')).toBeNull()
    );
    expect(source.moveTask).toHaveBeenCalledWith({
      wsId: 'ws-1',
      taskId: 'mine',
      fromCycleId: 'cycle-now',
      toCycleId: null,
    });

    reject(new Error('denied'));

    expect(await screen.findByText('Ship cycle view')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('move_failed');
  });

  it('moves a dropped task onto the next cycle', async () => {
    const source = makeSource();
    renderView(source);

    const row = await screen.findByRole('link', { name: 'Review copy' });
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: 'none',
    };
    fireEvent.dragStart(row, { dataTransfer });
    const next = screen.getByRole('radio', { name: 'scope_next' });
    fireEvent.dragOver(next, { dataTransfer });
    fireEvent.drop(next, { dataTransfer });

    await waitFor(() =>
      expect(source.moveTask).toHaveBeenCalledWith({
        wsId: 'ws-1',
        taskId: 'alice',
        fromCycleId: 'cycle-now',
        toCycleId: 'cycle-next',
      })
    );
    expect(screen.queryByText('Review copy')).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
