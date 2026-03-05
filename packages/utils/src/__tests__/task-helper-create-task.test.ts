import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({})),
}));

import { createTask } from '../task-helper';

type TaskCreateInputWithScheduling = Partial<Task> & {
  total_duration?: number | null;
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: Task['calendar_hours'];
  auto_schedule?: boolean | null;
};

type InsertedTaskRecord = {
  id: string;
  name: string;
  list_id: string;
  created_at: string;
};

type ListQuery = {
  eq: (column: 'id', value: string) => ListQuery;
  single: () => Promise<{ data: { id: string; name: string } | null }>;
};

type TaskSortQuery = {
  eq: (column: 'list_id', value: string) => TaskSortQuery;
  is: (column: 'deleted_at', value: null) => TaskSortQuery;
  order: (column: 'sort_key', options: { ascending: boolean }) => TaskSortQuery;
  limit: (
    count: number
  ) => Promise<{ data: Array<{ sort_key: string | null }>; error: null }>;
};

function createSupabaseMock() {
  const schedulingUpsert = vi.fn(async () => ({ error: null }));

  const listQuery: ListQuery = {
    eq: vi.fn((_, __) => listQuery),
    single: vi.fn(async () => ({ data: { id: 'list-1', name: 'Backlog' } })),
  };

  const taskSortQuery: TaskSortQuery = {
    eq: vi.fn((_, __) => taskSortQuery),
    is: vi.fn((_, __) => taskSortQuery),
    order: vi.fn((_, __) => taskSortQuery),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };

  const insertedTask: InsertedTaskRecord = {
    id: 'task-1',
    name: 'Task title',
    list_id: 'list-1',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  const taskInsertSingle = vi.fn(async () => ({
    data: insertedTask,
    error: null,
  }));

  const taskInsertSelect = vi.fn(() => ({
    single: taskInsertSingle,
  }));

  const taskInsert = vi.fn(() => ({
    select: taskInsertSelect,
  }));

  const taskSelect = vi.fn((columns: string) => {
    if (columns === 'sort_key') return taskSortQuery;
    throw new Error(`Unexpected tasks.select columns: ${columns}`);
  });

  const from = vi.fn((table: string) => {
    if (table === 'task_lists') {
      return {
        select: vi.fn(() => listQuery),
      };
    }

    if (table === 'tasks') {
      return {
        select: taskSelect,
        insert: taskInsert,
      };
    }

    if (table === 'task_user_scheduling_settings') {
      return {
        upsert: schedulingUpsert,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: 'user-1',
          },
        },
        error: null,
      })),
    },
    from,
  };

  return {
    supabase: supabase as unknown as TypedSupabaseClient,
    schedulingUpsert,
  };
}

describe('createTask scheduling persistence', () => {
  it('does not upsert scheduling when no scheduling fields are provided', async () => {
    const { supabase, schedulingUpsert } = createSupabaseMock();

    await createTask(supabase, 'list-1', {
      name: 'Task title',
    });

    expect(schedulingUpsert).not.toHaveBeenCalled();
  });

  it('upserts scheduling when scheduling fields are provided', async () => {
    const { supabase, schedulingUpsert } = createSupabaseMock();

    const taskInput: TaskCreateInputWithScheduling = {
      name: 'Task title',
      total_duration: 2,
      is_splittable: true,
      min_split_duration_minutes: 30,
      max_split_duration_minutes: 120,
      calendar_hours: 'work_hours',
      auto_schedule: true,
    };

    await createTask(supabase, 'list-1', taskInput);

    expect(schedulingUpsert).toHaveBeenCalledTimes(1);
    expect(schedulingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-1',
        user_id: 'user-1',
        total_duration: 2,
        is_splittable: true,
        min_split_duration_minutes: 30,
        max_split_duration_minutes: 120,
        calendar_hours: 'work_hours',
        auto_schedule: true,
      }),
      { onConflict: 'task_id,user_id' }
    );
  });

  it('keeps explicit false/null scheduling values instead of forcing true defaults', async () => {
    const { supabase, schedulingUpsert } = createSupabaseMock();

    const taskInput: TaskCreateInputWithScheduling = {
      name: 'Task title',
      total_duration: null,
      is_splittable: false,
      min_split_duration_minutes: null,
      max_split_duration_minutes: null,
      calendar_hours: null,
      auto_schedule: false,
    };

    await createTask(supabase, 'list-1', taskInput);

    expect(schedulingUpsert).toHaveBeenCalledTimes(1);
    expect(schedulingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        is_splittable: false,
        auto_schedule: false,
        total_duration: null,
        calendar_hours: null,
      }),
      { onConflict: 'task_id,user_id' }
    );
  });
});
