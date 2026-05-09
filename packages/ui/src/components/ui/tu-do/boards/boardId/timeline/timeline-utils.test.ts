import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimelineModel, computeTimelineSpans } from './timeline-utils';

const lists: TaskList[] = [
  {
    id: 'todo',
    name: 'To Do',
    status: 'not_started',
    color: 'GRAY',
    position: 0,
    board_id: 'board-1',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    archived: false,
  },
  {
    id: 'doing',
    name: 'Doing',
    status: 'active',
    color: 'BLUE',
    position: 1,
    board_id: 'board-1',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    archived: false,
  },
];

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
  return {
    display_number: 1,
    created_at: '2026-05-01T00:00:00.000Z',
    list_id: 'todo',
    ...overrides,
  } as Task;
}

describe('timeline row model', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps every scheduled task on a readable row within its list group', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));

    const model = buildTimelineModel(
      [
        task({
          id: 'task-a',
          name: 'First readable task',
          start_date: '2026-05-08T00:00:00.000Z',
          end_date: '2026-05-10T23:59:59.999Z',
        }),
        task({
          id: 'task-b',
          name: 'Second overlapping task',
          start_date: '2026-05-08T00:00:00.000Z',
          end_date: '2026-05-08T23:59:59.999Z',
        }),
      ],
      lists
    );

    const todo = model.groups.find((group) => group.id === 'todo');

    expect(todo?.rowCount).toBe(2);
    expect(todo?.items.map((item) => item.task.name)).toEqual([
      'First readable task',
      'Second overlapping task',
    ]);
    expect(todo?.items.map((item) => item.rowIndex)).toEqual([0, 1]);
  });

  it('preserves unscheduled and unknown-list tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));

    const model = buildTimelineModel(
      [
        task({ id: 'unscheduled', name: 'No date task' }),
        task({
          id: 'external',
          name: 'External task with source metadata',
          list_id: 'external-list',
          source_workspace_name: 'External workspace',
          source_list_name: 'Source To Do',
          start_date: '2026-05-12T00:00:00.000Z',
          end_date: '2026-05-12T23:59:59.999Z',
        } as Partial<Task> & Pick<Task, 'id' | 'name'>),
      ],
      lists
    );

    expect(model.unscheduled.map((item) => item.id)).toEqual(['unscheduled']);
    expect(model.groups.at(-1)).toEqual(
      expect.objectContaining({
        id: 'unknown-list',
        rowCount: 1,
      })
    );
    expect(model.groups.at(-1)?.items[0]?.task.source_workspace_name).toBe(
      'External workspace'
    );
  });

  it('keeps span computation stable for existing analytics exports', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));

    const spans = computeTimelineSpans(
      [
        task({
          id: 'task-a',
          name: 'Timed task',
          start_date: '2026-05-07T00:00:00.000Z',
          end_date: '2026-05-09T23:59:59.999Z',
        }),
      ],
      lists
    );

    expect(spans.spans[0]).toEqual(
      expect.objectContaining({
        isOngoing: true,
      })
    );
    expect(spans.spans[0]?.durationDays).toBeGreaterThan(0);
  });
});
