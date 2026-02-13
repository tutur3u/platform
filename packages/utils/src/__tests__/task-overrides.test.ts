import type {
  TaskUserOverride,
  TaskWithRelations,
  UserBoardListOverride,
} from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { isPersonallyHidden, resolveEffectiveValues } from '../task-overrides';

// Helper to create a minimal TaskWithRelations object for testing
function makeTask(
  overrides: Partial<TaskWithRelations> = {}
): TaskWithRelations {
  return {
    id: 'task-1',
    name: 'Test Task',
    priority: 'normal',
    end_date: '2026-03-01T00:00:00Z',
    estimation_points: 3,
    list: {
      id: 'list-1',
      name: 'To Do',
      status: 'active',
      board: {
        id: 'board-1',
        name: 'Sprint Board',
        ws_id: 'ws-1',
      },
    },
    assignees: [],
    labels: [],
    ...overrides,
  } as TaskWithRelations;
}

function makeOverride(
  overrides: Partial<TaskUserOverride> = {}
): TaskUserOverride {
  return {
    task_id: 'task-1',
    user_id: 'user-1',
    self_managed: false,
    completed_at: null,
    priority_override: null,
    due_date_override: null,
    estimation_override: null,
    personally_unassigned: false,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBoardListOverride(
  overrides: Partial<UserBoardListOverride> = {}
): UserBoardListOverride {
  return {
    id: 'blo-1',
    user_id: 'user-1',
    scope_type: 'board',
    board_id: null,
    list_id: null,
    personal_status: 'not_started',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveEffectiveValues', () => {
  it('returns the original task when overrides is null', () => {
    const task = makeTask();
    const result = resolveEffectiveValues(task, null);
    expect(result).toBe(task); // same reference
  });

  it('returns the original task when overrides is undefined', () => {
    const task = makeTask();
    const result = resolveEffectiveValues(task, undefined);
    expect(result).toBe(task);
  });

  it('returns the original task when self_managed is false', () => {
    const task = makeTask();
    const override = makeOverride({ self_managed: false });
    const result = resolveEffectiveValues(task, override);
    expect(result).toBe(task);
  });

  it('applies priority override when self_managed is true', () => {
    const task = makeTask({ priority: 'normal' });
    const override = makeOverride({
      self_managed: true,
      priority_override: 'critical',
    });
    const result = resolveEffectiveValues(task, override);
    expect(result.priority).toBe('critical');
    expect(result.end_date).toBe(task.end_date); // unchanged
    expect(result.estimation_points).toBe(task.estimation_points); // unchanged
  });

  it('applies due date override when self_managed is true', () => {
    const task = makeTask({ end_date: '2026-03-01T00:00:00Z' });
    const override = makeOverride({
      self_managed: true,
      due_date_override: '2026-04-15T00:00:00Z',
    });
    const result = resolveEffectiveValues(task, override);
    expect(result.end_date).toBe('2026-04-15T00:00:00Z');
    expect(result.priority).toBe(task.priority); // unchanged
  });

  it('applies estimation override when self_managed is true', () => {
    const task = makeTask({ estimation_points: 3 });
    const override = makeOverride({
      self_managed: true,
      estimation_override: 5,
    });
    const result = resolveEffectiveValues(task, override);
    expect(result.estimation_points).toBe(5);
  });

  it('applies all overrides simultaneously', () => {
    const task = makeTask({
      priority: 'low',
      end_date: '2026-03-01T00:00:00Z',
      estimation_points: 2,
    });
    const override = makeOverride({
      self_managed: true,
      priority_override: 'high',
      due_date_override: '2026-05-01T00:00:00Z',
      estimation_override: 7,
    });
    const result = resolveEffectiveValues(task, override);
    expect(result.priority).toBe('high');
    expect(result.end_date).toBe('2026-05-01T00:00:00Z');
    expect(result.estimation_points).toBe(7);
  });

  it('keeps team value when override field is null (self_managed true)', () => {
    const task = makeTask({
      priority: 'high',
      end_date: '2026-03-01T00:00:00Z',
      estimation_points: 4,
    });
    const override = makeOverride({
      self_managed: true,
      priority_override: null,
      due_date_override: null,
      estimation_override: null,
    });
    const result = resolveEffectiveValues(task, override);
    expect(result.priority).toBe('high');
    expect(result.end_date).toBe('2026-03-01T00:00:00Z');
    expect(result.estimation_points).toBe(4);
  });

  it('does not mutate the original task', () => {
    const task = makeTask({ priority: 'low' });
    const override = makeOverride({
      self_managed: true,
      priority_override: 'critical',
    });
    const result = resolveEffectiveValues(task, override);
    expect(result).not.toBe(task);
    expect(task.priority).toBe('low'); // original unchanged
  });
});

describe('isPersonallyHidden', () => {
  it('returns false when no overrides', () => {
    const task = makeTask();
    expect(isPersonallyHidden(task, null, [])).toBe(false);
  });

  it('returns false when overrides have no hiding flags', () => {
    const task = makeTask();
    const override = makeOverride();
    expect(isPersonallyHidden(task, override, [])).toBe(false);
  });

  it('returns true when completed_at is set', () => {
    const task = makeTask();
    const override = makeOverride({
      completed_at: '2026-02-10T00:00:00Z',
    });
    expect(isPersonallyHidden(task, override, [])).toBe(true);
  });

  it('returns true when personally_unassigned is true', () => {
    const task = makeTask();
    const override = makeOverride({
      personally_unassigned: true,
    });
    expect(isPersonallyHidden(task, override, [])).toBe(true);
  });

  it('returns true when board override status is done', () => {
    const task = makeTask();
    const boardOverride = makeBoardListOverride({
      scope_type: 'board',
      board_id: 'board-1',
      personal_status: 'done',
    });
    expect(isPersonallyHidden(task, null, [boardOverride])).toBe(true);
  });

  it('returns true when board override status is closed', () => {
    const task = makeTask();
    const boardOverride = makeBoardListOverride({
      scope_type: 'board',
      board_id: 'board-1',
      personal_status: 'closed',
    });
    expect(isPersonallyHidden(task, null, [boardOverride])).toBe(true);
  });

  it('returns false when board override status is in_progress', () => {
    const task = makeTask();
    const boardOverride = makeBoardListOverride({
      scope_type: 'board',
      board_id: 'board-1',
      personal_status: 'in_progress',
    });
    expect(isPersonallyHidden(task, null, [boardOverride])).toBe(false);
  });

  it('returns true when list override status is done', () => {
    const task = makeTask();
    const listOverride = makeBoardListOverride({
      scope_type: 'list',
      list_id: 'list-1',
      personal_status: 'done',
    });
    expect(isPersonallyHidden(task, null, [listOverride])).toBe(true);
  });

  it('returns true when list override status is closed', () => {
    const task = makeTask();
    const listOverride = makeBoardListOverride({
      scope_type: 'list',
      list_id: 'list-1',
      personal_status: 'closed',
    });
    expect(isPersonallyHidden(task, null, [listOverride])).toBe(true);
  });

  it('returns false when board override is for a different board', () => {
    const task = makeTask();
    const boardOverride = makeBoardListOverride({
      scope_type: 'board',
      board_id: 'other-board',
      personal_status: 'done',
    });
    expect(isPersonallyHidden(task, null, [boardOverride])).toBe(false);
  });

  it('returns false when list override is for a different list', () => {
    const task = makeTask();
    const listOverride = makeBoardListOverride({
      scope_type: 'list',
      list_id: 'other-list',
      personal_status: 'done',
    });
    expect(isPersonallyHidden(task, null, [listOverride])).toBe(false);
  });

  it('handles task with no list', () => {
    const task = makeTask({ list: null as any });
    const boardOverride = makeBoardListOverride({
      scope_type: 'board',
      board_id: 'board-1',
      personal_status: 'done',
    });
    expect(isPersonallyHidden(task, null, [boardOverride])).toBe(false);
  });

  it('handles task with no board on list', () => {
    const task = makeTask({
      list: { id: 'list-1', name: 'Test', status: 'active', board: null },
    } as any);
    const boardOverride = makeBoardListOverride({
      scope_type: 'board',
      board_id: 'board-1',
      personal_status: 'done',
    });
    expect(isPersonallyHidden(task, null, [boardOverride])).toBe(false);
  });

  it('returns true when any hiding condition is met (completion takes priority)', () => {
    const task = makeTask();
    const override = makeOverride({
      completed_at: '2026-02-10T00:00:00Z',
      personally_unassigned: true,
    });
    expect(isPersonallyHidden(task, override, [])).toBe(true);
  });
});
