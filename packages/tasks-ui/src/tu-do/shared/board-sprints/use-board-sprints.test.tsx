import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardSprintsResponse } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  getBoardSprintsQueryKey,
  useBoardSprintMutations,
  useBoardSprints,
} from './use-board-sprints';

const api = vi.hoisted(() => ({ unplan: vi.fn() }));

vi.mock('@tuturuuu/internal-api/task-sprints', () => ({
  listWorkspaceTaskBoardSprints: vi.fn(() => new Promise(() => undefined)),
  moveTasksOutOfWorkspaceTaskBoardSprints: api.unplan,
}));

const response: BoardSprintsResponse = {
  schemaAvailable: true,
  sprintLengthWeeks: 2,
  sprints: [
    {
      id: 'sprint-1',
      name: 'Sprint 1',
      sequence_number: 1,
      status: 'active',
      start_date: '2026-10-26',
      end_date: '2026-11-06',
      goal: null,
      goal_result: null,
      started_at: '2026-10-26T08:00:00Z',
      ended_at: null,
      tasks: [
        {
          task_id: 'in-sprint',
          added_after_start: false,
          carry_count: 0,
          end_decision: null,
        },
      ],
      report: null,
    },
  ],
  unplannedTaskIds: ['parked'],
};

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getBoardSprintsQueryKey('b'), response);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => ({
      sprints: useBoardSprints({ boardId: 'b', wsId: 'w' }),
      mutations: useBoardSprintMutations({ boardId: 'b', wsId: 'w' }),
    }),
    { wrapper }
  );
}

const task = (id: string) => ({ id }) as Task;

describe('useBoardSprints', () => {
  it('leaves tasks parked outside every sprint off the Board view', () => {
    const { result } = setup();
    const shows = result.current.sprints.showsOnBoard!;
    expect(shows(task('in-sprint'))).toBe(true);
    expect(shows(task('parked'))).toBe(false);
    // Created after the sprints loaded: the database put it in the sprint.
    expect(shows(task('brand-new'))).toBe(true);
  });

  it('parks a task at once when it moves out of every sprint', async () => {
    api.unplan.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();
    act(() =>
      result.current.mutations.moveTasks.mutate({
        sprintId: null,
        taskIds: ['in-sprint'],
      })
    );
    await waitFor(() =>
      expect(result.current.sprints.showsOnBoard!(task('in-sprint'))).toBe(
        false
      )
    );
    expect(api.unplan).toHaveBeenCalledWith('w', 'b', ['in-sprint']);
  });
});
