import { describe, expect, it, vi } from 'vitest';
import {
  areAllMentionedTasksCompleted,
  extractTaskMentionIds,
  getCompletedTaskColor,
  getNextTriState,
  type MentionedTaskRow,
  resolveCheckboxState,
} from '../task-item-checkbox';

// Mock the Supabase client
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [],
            error: null,
          }),
      }),
    }),
  }),
}));

describe('Task Mention Detection', () => {
  describe('extractTaskMentionIds logic', () => {
    it('should return empty array for empty node', () => {
      const mockNode = {
        descendants: vi.fn((_callback) => {
          // No children to traverse
        }),
      };

      const taskIds = extractTaskMentionIds(mockNode as never);
      expect(taskIds).toEqual([]);
    });

    it('should extract task mention IDs from nodes', () => {
      const mockNode = {
        descendants: vi.fn((callback) => {
          callback({ type: { name: 'paragraph' }, attrs: {} });
          callback({
            type: { name: 'mention' },
            attrs: { entityType: 'task', entityId: 'task-123' },
          });
          callback({
            type: { name: 'mention' },
            attrs: { entityType: 'user', entityId: 'user-456' },
          });
          callback({
            type: { name: 'mention' },
            attrs: { entityType: 'task', entityId: 'task-789' },
          });
        }),
      };

      const taskIds = extractTaskMentionIds(mockNode as never);

      expect(taskIds).toEqual(['task-123', 'task-789']);
    });

    it('should skip non-task mentions', () => {
      const mockNode = {
        descendants: vi.fn((callback) => {
          callback({
            type: { name: 'mention' },
            attrs: { entityType: 'user', entityId: 'user-123' },
          });
          callback({
            type: { name: 'mention' },
            attrs: { entityType: 'project', entityId: 'proj-456' },
          });
        }),
      };

      const taskIds = extractTaskMentionIds(mockNode as never);

      expect(taskIds).toEqual([]);
    });
  });

  describe('allMentionedTasksCompleted logic', () => {
    it('should return false when no tasks', () => {
      const mentionedTasks: MentionedTaskRow[] = [];
      const result = areAllMentionedTasksCompleted(mentionedTasks);
      expect(result).toBe(false);
    });

    it('should return true when all tasks are closed', () => {
      const mentionedTasks = [
        {
          id: 'task-1',
          closed_at: '2024-01-01',
          task_lists: { status: 'active' },
        },
        {
          id: 'task-2',
          closed_at: '2024-01-02',
          task_lists: { status: 'active' },
        },
      ];
      const result = areAllMentionedTasksCompleted(mentionedTasks);
      expect(result).toBe(true);
    });

    it('should return true when all tasks are in done/closed list', () => {
      const mentionedTasks = [
        { id: 'task-1', closed_at: null, task_lists: { status: 'done' } },
        { id: 'task-2', closed_at: null, task_lists: { status: 'closed' } },
      ];
      const result = areAllMentionedTasksCompleted(mentionedTasks);
      expect(result).toBe(true);
    });

    it('should return false when some tasks are still active', () => {
      const mentionedTasks = [
        {
          id: 'task-1',
          closed_at: '2024-01-01',
          task_lists: { status: 'active' },
        },
        { id: 'task-2', closed_at: null, task_lists: { status: 'active' } },
      ];
      const result = areAllMentionedTasksCompleted(mentionedTasks);
      expect(result).toBe(false);
    });
  });

  describe('completedTaskColor logic', () => {
    it('should return null when no tasks', () => {
      const mentionedTasks: Array<{
        id: string;
        task_lists: { color: string | null };
      }> = [];
      const result = getCompletedTaskColor(mentionedTasks);
      expect(result).toBe(null);
    });

    it('should return the first task color', () => {
      const mentionedTasks = [
        { id: 'task-1', task_lists: { color: 'Green' } },
        { id: 'task-2', task_lists: { color: 'Blue' } },
      ];
      const result = getCompletedTaskColor(mentionedTasks);
      expect(result).toBe('green');
    });

    it('should skip tasks without color', () => {
      const mentionedTasks = [
        { id: 'task-1', task_lists: { color: null } },
        { id: 'task-2', task_lists: { color: 'Purple' } },
      ];
      const result = getCompletedTaskColor(mentionedTasks);
      expect(result).toBe('purple');
    });
  });

  describe('checkbox priority logic', () => {
    it('should prioritize manual override', () => {
      const manualOverride = true;
      const nodeChecked = false;
      const allMentionedTasksCompleted = false;

      const result = resolveCheckboxState({
        manualOverride,
        nodeChecked,
        allMentionedTasksCompleted,
      });

      expect(result).toBe(true);
    });

    it('should use node.attrs.checked when no manual override', () => {
      const manualOverride = null;
      const nodeChecked = true;
      const allMentionedTasksCompleted = false;

      const result = resolveCheckboxState({
        manualOverride,
        nodeChecked,
        allMentionedTasksCompleted,
      });

      expect(result).toBe(true);
    });

    it('should use allMentionedTasksCompleted as fallback', () => {
      const manualOverride = null;
      const nodeChecked = undefined;
      const allMentionedTasksCompleted = true;

      const result = resolveCheckboxState({
        manualOverride,
        nodeChecked,
        allMentionedTasksCompleted,
      });

      expect(result).toBe(true);
    });

    it('should preserve indeterminate node state', () => {
      const result = resolveCheckboxState({
        manualOverride: null,
        nodeChecked: 'indeterminate',
        allMentionedTasksCompleted: false,
      });

      expect(result).toBe('indeterminate');
    });
  });

  describe('tri-state cycle', () => {
    it('should cycle false -> indeterminate -> true -> false', () => {
      expect(getNextTriState(false)).toBe('indeterminate');
      expect(getNextTriState('indeterminate')).toBe(true);
      expect(getNextTriState(true)).toBe(false);
    });
  });
});
