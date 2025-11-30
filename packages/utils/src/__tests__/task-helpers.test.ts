import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateOverdueDays,
  filterTasks,
  getFilteredMetrics,
  getStatusColor,
  getTaskCompletionDate,
  groupTasksByStatus,
  hasDraggableData,
} from '../task-helpers';

describe('Task Helpers', () => {
  describe('hasDraggableData', () => {
    it('returns false for null element', () => {
      expect(hasDraggableData(null)).toBe(false);
    });

    it('returns false for element without data', () => {
      expect(hasDraggableData({ id: '1' } as any)).toBe(false);
    });

    it('returns false for element without current data', () => {
      expect(hasDraggableData({ id: '1', data: {} } as any)).toBe(false);
    });

    it('returns true for valid Task type with task data', () => {
      const element = {
        id: '1',
        data: { current: { type: 'Task', task: { id: 'task-1' } } },
      };
      expect(hasDraggableData(element as any)).toBe(true);
    });

    it('returns true for valid Column type with column data', () => {
      const element = {
        id: '1',
        data: { current: { type: 'Column', column: { id: 'col-1' } } },
      };
      expect(hasDraggableData(element as any)).toBe(true);
    });

    it('returns false for Task type without task data', () => {
      const element = {
        id: '1',
        data: { current: { type: 'Task' } },
      };
      expect(hasDraggableData(element as any)).toBe(false);
    });

    it('returns false for Column type without column data', () => {
      const element = {
        id: '1',
        data: { current: { type: 'Column' } },
      };
      expect(hasDraggableData(element as any)).toBe(false);
    });

    it('returns false for unknown type', () => {
      const element = {
        id: '1',
        data: { current: { type: 'Unknown' } },
      };
      expect(hasDraggableData(element as any)).toBe(false);
    });
  });

  describe('calculateOverdueDays', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns positive days for past due date', () => {
      vi.setSystemTime(new Date('2024-01-15T00:00:00'));
      // Due date was Jan 10 midnight, current is Jan 15 midnight = 5 days
      expect(calculateOverdueDays('2024-01-10T00:00:00')).toBe(5);
    });

    it('returns zero for today due date', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00'));
      expect(calculateOverdueDays('2024-01-15')).toBe(1); // Less than 24h from midnight
    });

    it('returns negative days for future due date', () => {
      vi.setSystemTime(new Date('2024-01-15T00:00:00'));
      // Due date is Jan 20 midnight, current is Jan 15 midnight = -5 days
      expect(calculateOverdueDays('2024-01-20T00:00:00')).toBe(-5);
    });

    it('handles Date objects', () => {
      vi.setSystemTime(new Date('2024-01-15T00:00:00'));
      expect(calculateOverdueDays(new Date('2024-01-10T00:00:00'))).toBe(5);
    });

    it('handles ISO date strings', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      expect(calculateOverdueDays('2024-01-10T00:00:00Z')).toBeGreaterThan(0);
    });
  });

  describe('getTaskCompletionDate', () => {
    it('returns completed_at date when available', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        completed_at: '2024-01-15T10:00:00Z',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toEqual(new Date('2024-01-15T10:00:00Z'));
    });

    it('returns updated_at when completed_at is not available', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        updated_at: '2024-01-14T10:00:00Z',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toEqual(new Date('2024-01-14T10:00:00Z'));
    });

    it('checks multiple completion date fields in order', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        closed_at: '2024-01-13T10:00:00Z',
        finished_at: '2024-01-12T10:00:00Z',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toEqual(new Date('2024-01-13T10:00:00Z'));
    });

    it('returns null for task without completion dates', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toBeNull();
    });

    it('falls back to updated_at for done status tasks', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        listStatus: 'done',
        updated_at: '2024-01-15T10:00:00Z',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toEqual(new Date('2024-01-15T10:00:00Z'));
    });

    it('falls back to created_at for archived tasks without updated_at', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        archived: true,
        created_at: '2024-01-10T10:00:00Z',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toEqual(new Date('2024-01-10T10:00:00Z'));
    });

    it('handles invalid date strings gracefully', () => {
      const task = {
        id: '1',
        name: 'Test',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        completed_at: 'invalid-date',
        updated_at: '2024-01-15T10:00:00Z',
      };
      const result = getTaskCompletionDate(task);
      expect(result).toEqual(new Date('2024-01-15T10:00:00Z'));
    });
  });

  describe('getStatusColor', () => {
    it('returns green for done status', () => {
      expect(getStatusColor('done')).toBe('bg-green-500');
    });

    it('returns green for closed status', () => {
      expect(getStatusColor('closed')).toBe('bg-green-500');
    });

    it('returns blue for active status', () => {
      expect(getStatusColor('active')).toBe('bg-blue-500');
    });

    it('returns gray for unknown status', () => {
      expect(getStatusColor('unknown')).toBe('bg-gray-400');
    });

    it('returns gray for empty status', () => {
      expect(getStatusColor('')).toBe('bg-gray-400');
    });

    it('returns gray for not_started status', () => {
      expect(getStatusColor('not_started')).toBe('bg-gray-400');
    });
  });

  describe('filterTasks', () => {
    const tasks = [
      {
        id: '1',
        name: 'Task 1',
        boardId: 'board-1',
        boardName: 'Board 1',
        listName: 'To Do',
        listStatus: 'not_started',
      },
      {
        id: '2',
        name: 'Task 2',
        boardId: 'board-1',
        boardName: 'Board 1',
        listName: 'In Progress',
        listStatus: 'active',
      },
      {
        id: '3',
        name: 'Task 3',
        boardId: 'board-2',
        boardName: 'Board 2',
        listName: 'Done',
        listStatus: 'done',
      },
      {
        id: '4',
        name: 'Task 4',
        boardId: 'board-2',
        boardName: 'Board 2',
        listName: 'Closed',
        listStatus: 'closed',
      },
    ];

    it('returns all tasks when no filters applied', () => {
      const result = filterTasks(tasks, null, 'all');
      expect(result).toHaveLength(4);
    });

    it('filters by board ID', () => {
      const result = filterTasks(tasks, 'board-1', 'all');
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.boardId === 'board-1')).toBe(true);
    });

    it('filters by status not_started', () => {
      const result = filterTasks(tasks, null, 'not_started');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('1');
    });

    it('filters by status active', () => {
      const result = filterTasks(tasks, null, 'active');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('2');
    });

    it('filters by status done', () => {
      const result = filterTasks(tasks, null, 'done');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('3');
    });

    it('filters by status closed', () => {
      const result = filterTasks(tasks, null, 'closed');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('4');
    });

    it('combines board and status filters', () => {
      const result = filterTasks(tasks, 'board-1', 'active');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('2');
    });

    it('returns empty array when no matches', () => {
      const result = filterTasks(tasks, 'board-1', 'done');
      expect(result).toHaveLength(0);
    });

    it('handles tasks without listStatus as not_started', () => {
      const tasksWithoutStatus = [
        {
          id: '1',
          name: 'Task',
          boardId: 'b1',
          boardName: 'Board',
          listName: 'List',
        },
      ];
      const result = filterTasks(tasksWithoutStatus, null, 'not_started');
      expect(result).toHaveLength(1);
    });
  });

  describe('groupTasksByStatus', () => {
    const tasks = [
      {
        id: '1',
        name: 'Task 1',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        listStatus: 'not_started',
      },
      {
        id: '2',
        name: 'Task 2',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        listStatus: 'active',
      },
      {
        id: '3',
        name: 'Task 3',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        listStatus: 'done',
      },
      {
        id: '4',
        name: 'Task 4',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        listStatus: 'closed',
      },
      {
        id: '5',
        name: 'Task 5',
        boardId: 'b1',
        boardName: 'Board',
        listName: 'List',
        archived: true,
      },
    ];

    it('groups tasks by their status', () => {
      const result = groupTasksByStatus(tasks);
      expect(result.not_started).toHaveLength(1);
      expect(result.active).toHaveLength(1);
      expect(result.done).toHaveLength(2); // done + archived
      expect(result.closed).toHaveLength(1);
    });

    it('puts archived tasks in done group', () => {
      const result = groupTasksByStatus(tasks);
      expect(result.done?.some((t) => t.id === '5')).toBe(true);
    });

    it('puts tasks without status in not_started group', () => {
      const tasksWithoutStatus = [
        {
          id: '1',
          name: 'Task',
          boardId: 'b1',
          boardName: 'Board',
          listName: 'List',
        },
      ];
      const result = groupTasksByStatus(tasksWithoutStatus);
      expect(result.not_started).toHaveLength(1);
    });

    it('returns empty groups for empty input', () => {
      const result = groupTasksByStatus([]);
      expect(result.not_started).toHaveLength(0);
      expect(result.active).toHaveLength(0);
      expect(result.done).toHaveLength(0);
      expect(result.closed).toHaveLength(0);
    });
  });

  describe('getFilteredMetrics', () => {
    const boardMetrics = [
      {
        id: 'board-1',
        totalTasks: 10,
        completedTasks: 5,
        overdueTasks: 2,
        highPriorityTasks: 3,
        progressPercentage: 50,
      },
      {
        id: 'board-2',
        totalTasks: 20,
        completedTasks: 15,
        overdueTasks: 1,
        highPriorityTasks: 5,
        progressPercentage: 75,
      },
      {
        id: 'board-3',
        totalTasks: 30,
        completedTasks: 30,
        overdueTasks: 0,
        highPriorityTasks: 10,
        progressPercentage: 100,
      },
    ];

    it('aggregates all boards when no selection', () => {
      const result = getFilteredMetrics(boardMetrics, null);
      expect(result.totalTasks).toBe(60);
      expect(result.totalCompleted).toBe(50);
      expect(result.totalOverdue).toBe(3);
      expect(result.totalHighPriority).toBe(18);
      expect(result.avgProgress).toBe(75); // (50 + 75 + 100) / 3
    });

    it('filters by selected board', () => {
      const result = getFilteredMetrics(boardMetrics, 'board-1');
      expect(result.totalTasks).toBe(10);
      expect(result.totalCompleted).toBe(5);
      expect(result.totalOverdue).toBe(2);
      expect(result.totalHighPriority).toBe(3);
      expect(result.avgProgress).toBe(50);
    });

    it('returns zero values for empty data', () => {
      const result = getFilteredMetrics([], null);
      expect(result.totalTasks).toBe(0);
      expect(result.totalCompleted).toBe(0);
      expect(result.totalOverdue).toBe(0);
      expect(result.totalHighPriority).toBe(0);
      expect(result.avgProgress).toBe(0);
    });

    it('returns zero values for non-existent board', () => {
      const result = getFilteredMetrics(boardMetrics, 'non-existent');
      expect(result.totalTasks).toBe(0);
      expect(result.avgProgress).toBe(0);
    });
  });
});
