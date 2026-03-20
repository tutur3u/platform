import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateWorkspaceTask } = vi.hoisted(() => ({
  mockCreateWorkspaceTask: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock('@tuturuuu/internal-api/tasks', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/internal-api/tasks')
  >('@tuturuuu/internal-api/tasks');

  return {
    ...actual,
    createWorkspaceTask: mockCreateWorkspaceTask,
  };
});

import { createTask } from '../task-helper';

type TaskCreateInputWithScheduling = Partial<Task> & {
  total_duration?: number | null;
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: Task['calendar_hours'];
  auto_schedule?: boolean | null;
};

function createSupabaseMock() {
  const listQuery = {
    eq: vi.fn(() => listQuery),
    single: vi.fn(async () => ({
      data: {
        id: 'list-1',
        name: 'Backlog',
        board_id: 'board-1',
        status: 'not_started',
        workspace_boards: { ws_id: 'ws-1' },
      },
      error: null,
    })),
  };

  const from = vi.fn((table: string) => {
    if (table === 'task_lists') {
      return {
        select: vi.fn(() => listQuery),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: 'user-1',
            },
          },
          error: null,
        })),
        getSession: vi.fn(async () => ({
          data: {
            session: {
              access_token: 'token-1',
            },
          },
          error: null,
        })),
      },
      from,
    } as unknown as TypedSupabaseClient,
  };
}

describe('createTask scheduling persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateWorkspaceTask.mockResolvedValue({
      task: {
        id: 'task-1',
        name: 'Task title',
        list_id: 'list-1',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('sends null scheduling fields when none are provided', async () => {
    const { supabase } = createSupabaseMock();

    await createTask(supabase, 'ws-1', 'list-1', {
      name: 'Task title',
    });

    expect(mockCreateWorkspaceTask).toHaveBeenCalledTimes(1);
    expect(mockCreateWorkspaceTask).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        name: 'Task title',
        listId: 'list-1',
      }),
      expect.any(Object)
    );

    const payload = mockCreateWorkspaceTask.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;

    expect(payload.total_duration).toBeNull();
    expect(payload.is_splittable).toBeNull();
    expect(payload.min_split_duration_minutes).toBeNull();
    expect(payload.max_split_duration_minutes).toBeNull();
    expect(payload.calendar_hours).toBeNull();
    expect(payload.auto_schedule).toBeNull();
  });

  it('forwards scheduling fields when they are provided', async () => {
    const { supabase } = createSupabaseMock();

    const taskInput: TaskCreateInputWithScheduling = {
      name: 'Task title',
      total_duration: 2,
      is_splittable: true,
      min_split_duration_minutes: 30,
      max_split_duration_minutes: 120,
      calendar_hours: 'work_hours',
      auto_schedule: true,
    };

    await createTask(supabase, 'ws-1', 'list-1', taskInput);

    expect(mockCreateWorkspaceTask).toHaveBeenCalledTimes(1);
    expect(mockCreateWorkspaceTask).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        total_duration: 2,
        is_splittable: true,
        min_split_duration_minutes: 30,
        max_split_duration_minutes: 120,
        calendar_hours: 'work_hours',
        auto_schedule: true,
      }),
      expect.any(Object)
    );
  });

  it('keeps explicit false/null scheduling values instead of forcing defaults', async () => {
    const { supabase } = createSupabaseMock();

    const taskInput: TaskCreateInputWithScheduling = {
      name: 'Task title',
      total_duration: null,
      is_splittable: false,
      min_split_duration_minutes: null,
      max_split_duration_minutes: null,
      calendar_hours: null,
      auto_schedule: false,
    };

    await createTask(supabase, 'ws-1', 'list-1', taskInput);

    expect(mockCreateWorkspaceTask).toHaveBeenCalledTimes(1);
    expect(mockCreateWorkspaceTask).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        is_splittable: false,
        auto_schedule: false,
        total_duration: null,
        calendar_hours: null,
      }),
      expect.any(Object)
    );
  });
});
