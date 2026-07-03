import { describe, expect, it, vi } from 'vitest';
import { fetchSchedulableTasksForWorkspace } from './schedulable-tasks';

function createTasksQuery(data: unknown) {
  const query = {
    in: vi.fn().mockResolvedValue({ data, error: null }),
    select: vi.fn(() => query),
  };

  return query;
}

describe('fetchSchedulableTasksForWorkspace', () => {
  it('fetches full admin task rows only for access-filtered schedulable task IDs', async () => {
    const tasksQuery = createTasksQuery([
      {
        id: 'task-allowed',
        name: 'Allowed roadmap task',
        task_lists: {
          workspace_boards: {
            ws_id: 'source-ws',
          },
        },
      },
    ]);
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table !== 'tasks') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return tasksQuery;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            sched_auto_schedule: true,
            sched_calendar_hours: 'work_hours',
            sched_is_splittable: true,
            sched_max_split_duration_minutes: 60,
            sched_min_split_duration_minutes: 15,
            sched_total_duration: 90,
            task_id: 'task-allowed',
            task_name: 'Allowed roadmap task',
          },
          {
            sched_auto_schedule: false,
            sched_calendar_hours: 'work_hours',
            sched_is_splittable: false,
            sched_max_split_duration_minutes: null,
            sched_min_split_duration_minutes: null,
            sched_total_duration: 90,
            task_id: 'task-disabled',
            task_name: 'Disabled task',
          },
          {
            sched_auto_schedule: true,
            sched_calendar_hours: 'work_hours',
            sched_is_splittable: false,
            sched_max_split_duration_minutes: null,
            sched_min_split_duration_minutes: null,
            sched_total_duration: 0,
            task_id: 'task-zero-duration',
            task_name: 'Zero duration task',
          },
        ],
        error: null,
      }),
    };

    const tasks = await fetchSchedulableTasksForWorkspace({
      isPersonalWorkspace: true,
      sbAdmin,
      userId: 'user-1',
      wsId: 'calendar-ws',
    });

    expect(sbAdmin.rpc).toHaveBeenCalledWith('get_user_tasks_with_relations', {
      p_exclude_personally_completed: false,
      p_exclude_personally_unassigned: false,
      p_filter_board_ids: undefined,
      p_filter_label_ids: undefined,
      p_filter_project_ids: undefined,
      p_filter_self_managed_only: false,
      p_filter_ws_ids: undefined,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'review', 'done'],
      p_user_id: 'user-1',
      p_ws_id: 'calendar-ws',
    });
    expect(sbAdmin.from).toHaveBeenCalledWith('tasks');
    expect(tasksQuery.in).toHaveBeenCalledWith('id', ['task-allowed']);
    expect(tasks).toEqual([
      {
        auto_schedule: true,
        calendar_hours: 'work_hours',
        id: 'task-allowed',
        is_splittable: true,
        max_split_duration_minutes: 60,
        min_split_duration_minutes: 15,
        name: 'Allowed roadmap task',
        total_duration: 90,
        ws_id: 'source-ws',
      },
    ]);
  });

  it('does not fetch full admin task rows when the access RPC returns no schedulable tasks', async () => {
    const sbAdmin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    };

    const tasks = await fetchSchedulableTasksForWorkspace({
      isPersonalWorkspace: false,
      sbAdmin,
      userId: 'user-1',
      wsId: 'workspace-ws',
    });

    expect(tasks).toEqual([]);
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });
});
