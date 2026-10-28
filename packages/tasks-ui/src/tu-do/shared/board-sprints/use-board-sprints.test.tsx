import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { BoardSprintsResponse } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardSprints } from './use-board-sprints';

const listSprints = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/task-sprints', () => ({
  listWorkspaceTaskBoardSprints: listSprints,
}));

const response = (taskIds: string[]): BoardSprintsResponse => ({
  schemaAvailable: true,
  sprintLengthWeeks: 2,
  sprints: [
    {
      id: 'sprint-2',
      name: 'Sprint 2',
      sequence_number: 2,
      status: 'active',
      start_date: '2026-10-26',
      end_date: '2026-11-06',
      goal: null,
      goal_result: null,
      started_at: null,
      ended_at: null,
      report: null,
      tasks: taskIds.map((task_id) => ({
        task_id,
        added_after_start: false,
        carry_count: 0,
        end_decision: null,
      })),
    },
  ],
});
const task = (id: string) => ({ id, completed_at: null }) as Task;

function setup(tasks: Task[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(
    ({ list }) => useBoardSprints({ boardId: 'b', tasks: list, wsId: 'ws' }),
    {
      initialProps: { list: tasks },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
}

describe('useBoardSprints', () => {
  beforeEach(() => listSprints.mockReset());

  it('refetches once when a new task appears that no sprint holds yet', async () => {
    listSprints.mockResolvedValue(response(['a']));
    const { result, rerender } = setup([task('a')]);
    await waitFor(() => expect(result.current.sprintsOn).toBe(true));
    expect(listSprints).toHaveBeenCalledTimes(1);

    // The database put the new task in the running sprint.
    listSprints.mockResolvedValue(response(['a', 'new']));
    rerender({ list: [task('a'), task('new')] });
    await waitFor(() =>
      expect(result.current.currentSprintTaskIds?.has('new')).toBe(true)
    );
    expect(listSprints).toHaveBeenCalledTimes(2);

    rerender({ list: [task('a'), task('new')] });
    expect(listSprints).toHaveBeenCalledTimes(2);
  });

  it('asks only once for a task that stays outside every sprint', async () => {
    listSprints.mockResolvedValue(response(['a']));
    const { result, rerender } = setup([task('a'), task('loose')]);
    await waitFor(() => expect(listSprints).toHaveBeenCalledTimes(2));
    rerender({ list: [task('a'), task('loose')] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listSprints).toHaveBeenCalledTimes(2);
    expect(result.current.currentSprintTaskIds?.has('loose')).toBe(false);
  });
});
