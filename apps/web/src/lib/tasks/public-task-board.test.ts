import { describe, expect, it, vi } from 'vitest';
import { buildPublicTaskBoardPayload } from './public-task-board';

vi.mock('server-only', () => ({}));

describe('buildPublicTaskBoardPayload', () => {
  it('returns only sanitized board, list, task, and display relationship fields', () => {
    const payload = buildPublicTaskBoardPayload({
      board: {
        archived_at: null,
        created_at: '2026-06-21T00:00:00.000Z',
        deleted_at: null,
        icon: null,
        id: 'board-1',
        name: 'Roadmap',
        ticket_prefix: 'RD',
      },
      generatedAt: '2026-06-21T00:00:00.000Z',
      lists: [
        {
          archived: false,
          color: 'BLUE',
          created_at: '2026-06-21T00:00:00.000Z',
          deleted: false,
          id: 'list-1',
          name: 'To Do',
          position: 0,
          status: 'not_started',
        },
        {
          archived: false,
          color: 'GRAY',
          created_at: '2026-06-21T00:00:00.000Z',
          deleted: true,
          id: 'list-deleted',
          name: 'Deleted',
          position: 1,
          status: 'active',
        },
      ],
      tasks: [
        {
          closed_at: null,
          completed_at: null,
          created_at: '2026-06-21T00:00:00.000Z',
          display_number: 7,
          end_date: '2026-06-30T00:00:00.000Z',
          estimation_points: 3,
          id: 'task-1',
          list_id: 'list-1',
          name: 'Ship public board',
          priority: 'high',
          sort_key: 1,
          start_date: null,
        },
        {
          closed_at: null,
          completed_at: null,
          created_at: '2026-06-21T00:00:00.000Z',
          display_number: 8,
          end_date: null,
          estimation_points: null,
          id: 'task-hidden',
          list_id: 'list-deleted',
          name: 'Hidden task',
          priority: null,
          sort_key: 2,
          start_date: null,
        },
      ],
      labels: [
        {
          task_id: 'task-1',
          workspace_task_labels: {
            color: '#123456',
            id: 'label-1',
            name: 'Customer',
          },
        },
      ],
      projects: [
        {
          task_id: 'task-1',
          task_projects: {
            id: 'project-1',
            name: 'Launch',
            status: 'active',
          },
        },
      ],
      assignees: [
        {
          task_id: 'task-1',
          users: {
            avatar_url: null,
            display_name: 'Ava Nguyen',
            handle: 'ava',
            id: 'user-1',
          },
        },
      ],
      truncated: false,
    });

    expect(payload).toMatchObject({
      board: {
        id: 'board-1',
        name: 'Roadmap',
        ticket_prefix: 'RD',
      },
      lists: [
        {
          id: 'list-1',
          name: 'To Do',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          name: 'Ship public board',
          labels: [{ id: 'label-1', name: 'Customer' }],
          projects: [{ id: 'project-1', name: 'Launch' }],
          assignees: [{ id: 'user-1', display_name: 'Ava Nguyen' }],
        },
      ],
    });
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0]).not.toHaveProperty('description');
    expect(payload.tasks[0]).not.toHaveProperty('description_yjs_state');
  });
});
