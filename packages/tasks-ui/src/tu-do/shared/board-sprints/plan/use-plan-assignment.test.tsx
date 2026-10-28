import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardMember } from '../../board-members-query';
import { usePlanAssignment } from './use-plan-assignment';

const updateTask = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  updateWorkspaceTask: updateTask,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('../../board-broadcast-context', () => ({
  useBoardBroadcast: () => undefined,
}));

const members: BoardMember[] = ['ana', 'binh', 'chi'].map((id) => ({
  id,
  display_name: id,
}));

describe('usePlanAssignment', () => {
  it('sends moves of one task in order so the last move wins', async () => {
    const resolvers: (() => void)[] = [];
    updateTask.mockImplementation(
      () => new Promise<void>((resolve) => resolvers.push(resolve))
    );
    const client = new QueryClient();
    const { result } = renderHook(
      () => usePlanAssignment({ boardId: 'b', members, wsId: 'ws' }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      }
    );
    const task = { id: 't', assignees: [members[0]] } as unknown as Task;

    act(() => result.current.move(task, { from: 'ana', to: 'binh' }));
    act(() =>
      result.current.move(
        { ...task, assignees: [members[1]] } as unknown as Task,
        {
          from: 'binh',
          to: 'chi',
        }
      )
    );

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenLastCalledWith('ws', 't', {
      assignee_ids: ['binh'],
    });
    // The second move waits for the first to settle.
    resolvers[0]?.();
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenLastCalledWith('ws', 't', {
      assignee_ids: ['chi'],
    });
    resolvers[1]?.();
  });
});
