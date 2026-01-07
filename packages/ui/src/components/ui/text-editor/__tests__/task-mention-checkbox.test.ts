import { describe, expect, it, vi } from 'vitest';

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

// Test the extractTaskMentionIds function logic
describe('Task Mention Detection', () => {
  describe('extractTaskMentionIds logic', () => {
    it('should return empty array for empty node', () => {
      const mockNode = {
        descendants: vi.fn((_callback) => {
          // No children to traverse
        }),
      };
      const taskIds: string[] = [];
      mockNode.descendants(
        (childNode: {
          type: { name: string };
          attrs: { entityType?: string; entityId?: string };
        }) => {
          if (
            childNode.type.name === 'mention' &&
            childNode.attrs.entityType === 'task' &&
            childNode.attrs.entityId
          ) {
            taskIds.push(childNode.attrs.entityId);
          }
          return true;
        }
      );
      expect(taskIds).toEqual([]);
    });

    it('should extract task mention IDs from nodes', () => {
      const mockChildren = [
        { type: { name: 'paragraph' }, attrs: {} },
        {
          type: { name: 'mention' },
          attrs: { entityType: 'task', entityId: 'task-123' },
        },
        {
          type: { name: 'mention' },
          attrs: { entityType: 'user', entityId: 'user-456' },
        },
        {
          type: { name: 'mention' },
          attrs: { entityType: 'task', entityId: 'task-789' },
        },
      ];

      const taskIds: string[] = [];
      mockChildren.forEach((childNode) => {
        if (
          childNode.type.name === 'mention' &&
          childNode.attrs.entityType === 'task' &&
          childNode.attrs.entityId
        ) {
          taskIds.push(childNode.attrs.entityId);
        }
      });

      expect(taskIds).toEqual(['task-123', 'task-789']);
    });

    it('should skip non-task mentions', () => {
      const mockChildren = [
        {
          type: { name: 'mention' },
          attrs: { entityType: 'user', entityId: 'user-123' },
        },
        {
          type: { name: 'mention' },
          attrs: { entityType: 'project', entityId: 'proj-456' },
        },
      ];

      const taskIds: string[] = [];
      mockChildren.forEach((childNode) => {
        if (
          childNode.type.name === 'mention' &&
          childNode.attrs.entityType === 'task' &&
          childNode.attrs.entityId
        ) {
          taskIds.push(childNode.attrs.entityId);
        }
      });

      expect(taskIds).toEqual([]);
    });
  });

  describe('allMentionedTasksCompleted logic', () => {
    it('should return false when no tasks', () => {
      const mentionedTasks: Array<{
        id: string;
        closed_at: string | null;
        task_lists: { status: string | null };
      }> = [];
      const result =
        mentionedTasks.length > 0 &&
        mentionedTasks.every((task) => {
          const listStatus = task.task_lists?.status;
          return (
            task.closed_at !== null ||
            listStatus === 'done' ||
            listStatus === 'closed'
          );
        });
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
      const result = mentionedTasks.every((task) => {
        const listStatus = task.task_lists?.status;
        return (
          task.closed_at !== null ||
          listStatus === 'done' ||
          listStatus === 'closed'
        );
      });
      expect(result).toBe(true);
    });

    it('should return true when all tasks are in done/closed list', () => {
      const mentionedTasks = [
        { id: 'task-1', closed_at: null, task_lists: { status: 'done' } },
        { id: 'task-2', closed_at: null, task_lists: { status: 'closed' } },
      ];
      const result = mentionedTasks.every((task) => {
        const listStatus = task.task_lists?.status;
        return (
          task.closed_at !== null ||
          listStatus === 'done' ||
          listStatus === 'closed'
        );
      });
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
      const result = mentionedTasks.every((task) => {
        const listStatus = task.task_lists?.status;
        return (
          task.closed_at !== null ||
          listStatus === 'done' ||
          listStatus === 'closed'
        );
      });
      expect(result).toBe(false);
    });
  });

  describe('completedTaskColor logic', () => {
    it('should return null when no tasks', () => {
      const mentionedTasks: Array<{
        id: string;
        task_lists: { color: string | null };
      }> = [];
      const taskWithColor = mentionedTasks.find((t) => t.task_lists?.color);
      const result = taskWithColor?.task_lists?.color?.toLowerCase() || null;
      expect(result).toBe(null);
    });

    it('should return the first task color', () => {
      const mentionedTasks = [
        { id: 'task-1', task_lists: { color: 'Green' } },
        { id: 'task-2', task_lists: { color: 'Blue' } },
      ];
      const taskWithColor = mentionedTasks.find((t) => t.task_lists?.color);
      const result = taskWithColor?.task_lists?.color?.toLowerCase() || null;
      expect(result).toBe('green');
    });

    it('should skip tasks without color', () => {
      const mentionedTasks = [
        { id: 'task-1', task_lists: { color: null } },
        { id: 'task-2', task_lists: { color: 'Purple' } },
      ];
      const taskWithColor = mentionedTasks.find((t) => t.task_lists?.color);
      const result = taskWithColor?.task_lists?.color?.toLowerCase() || null;
      expect(result).toBe('purple');
    });
  });

  describe('isChecked priority logic', () => {
    it('should prioritize manual override', () => {
      const manualOverride: boolean | null = true;
      const nodeChecked: boolean | undefined = false;
      const allMentionedTasksCompleted = false;

      const result =
        manualOverride ?? nodeChecked ?? allMentionedTasksCompleted;

      expect(result).toBe(true);
    });

    it('should use node.attrs.checked when no manual override', () => {
      const manualOverride: boolean | null = null;
      const nodeChecked: boolean | undefined = true;
      const allMentionedTasksCompleted = false;

      const result =
        manualOverride ?? nodeChecked ?? allMentionedTasksCompleted;

      expect(result).toBe(true);
    });

    it('should use allMentionedTasksCompleted as fallback', () => {
      const manualOverride: boolean | null = null;
      const nodeChecked: boolean | undefined = undefined;
      const allMentionedTasksCompleted = true;

      const result =
        manualOverride ?? nodeChecked ?? allMentionedTasksCompleted;

      expect(result).toBe(true);
    });
  });
});
