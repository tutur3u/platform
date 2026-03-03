import { z } from 'zod';
import { tool } from '../core';

const colorHexRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const taskToolDefinitions = {
  get_my_tasks: tool({
    description:
      "Get the current user's tasks organized by status. Returns overdue, due today, and upcoming tasks with priority and dates. Use category (or status) with values: all, overdue, today, upcoming.",
    inputSchema: z
      .object({
        category: z
          .enum(['all', 'overdue', 'today', 'upcoming'])
          .optional()
          .describe(
            'Filter tasks by time category. Use "all" to get everything.'
          ),
        status: z
          .enum(['all', 'overdue', 'today', 'upcoming'])
          .optional()
          .describe('Alias for category. Use either category or status.'),
      })
      .refine(
        (data) =>
          data.category === undefined ||
          data.status === undefined ||
          data.category === data.status,
        {
          message: 'category and status must match when both are provided',
          path: ['status'],
        }
      ),
  }),

  create_task: tool({
    description:
      "Create a new task in the user's workspace. Tasks MUST be placed in a task list (board → list hierarchy). Use list_boards and list_task_lists first to discover existing structure, then pass boardId and listId. If omitted, the system auto-picks the first board/list or creates defaults. By default the task is assigned to the current user.",
    inputSchema: z.object({
      name: z.string().describe('Task title'),
      description: z
        .string()
        .nullish()
        .describe('Task description (plain text), or null/omit'),
      priority: z
        .enum(['low', 'normal', 'high', 'critical'])
        .nullish()
        .describe('Task priority level, or null/omit for no priority'),
      boardId: z
        .string()
        .guid()
        .optional()
        .describe(
          'UUID of the board to create the task in. Use list_boards to discover. If omitted, uses the first workspace board or creates a default one.'
        ),
      listId: z
        .string()
        .guid()
        .optional()
        .describe(
          'UUID of the task list to place the task in. Use list_task_lists to discover lists within a board. If omitted, uses the first list in the board or creates a default one.'
        ),
      assignToSelf: z
        .boolean()
        .optional()
        .describe('Assign to current user. Defaults to true.'),
    }),
  }),

  complete_task: tool({
    description: 'Mark a task as completed by its ID.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('UUID of the task to complete'),
    }),
  }),

  update_task: tool({
    description:
      'Update fields on an existing task. Use taskId (or id) for the task UUID and endDate (or dueDate) for due date (ISO). Only pass fields that need changing.',
    inputSchema: z
      .object({
        taskId: z.string().guid().optional().describe('UUID of the task'),
        id: z
          .string()
          .guid()
          .optional()
          .describe('Alias for taskId. Use either taskId or id.'),
        name: z.string().optional().describe('New task name'),
        description: z
          .string()
          .nullable()
          .optional()
          .describe('New description'),
        priority: z
          .enum(['low', 'normal', 'high', 'critical'])
          .nullable()
          .optional()
          .describe('New priority'),
        startDate: z
          .string()
          .datetime()
          .nullable()
          .optional()
          .describe('Start date ISO'),
        endDate: z
          .string()
          .datetime()
          .nullable()
          .optional()
          .describe('Due date ISO (use for due date)'),
        dueDate: z
          .string()
          .datetime()
          .nullable()
          .optional()
          .describe('Alias for endDate. Use either endDate or dueDate.'),
        estimationPoints: z
          .number()
          .int()
          .min(0)
          .max(7)
          .optional()
          .describe('Estimation point index (0-7)'),
        listId: z
          .string()
          .guid()
          .optional()
          .describe('Move to a different list'),
      })
      .refine(
        (data) =>
          [data.taskId, data.id].some(
            (value) => typeof value === 'string' && value.trim().length > 0
          ),
        {
          message: 'taskId or id is required',
          path: ['taskId'],
        }
      )
      .refine(
        (data) =>
          data.taskId === undefined ||
          data.id === undefined ||
          data.taskId === data.id,
        {
          message: 'taskId and id must match when both are provided',
          path: ['id'],
        }
      )
      .refine(
        (data) =>
          data.endDate === undefined ||
          data.dueDate === undefined ||
          data.endDate === data.dueDate,
        {
          message: 'endDate and dueDate must match when both are provided',
          path: ['dueDate'],
        }
      ),
  }),

  delete_task: tool({
    description: 'Soft-delete a task by ID.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('UUID of the task to delete'),
    }),
  }),

  list_boards: tool({
    description: 'List all task boards in the workspace.',
    inputSchema: z.object({}),
  }),

  create_board: tool({
    description: 'Create a new task board.',
    inputSchema: z.object({
      name: z.string().describe('Board name'),
    }),
  }),

  update_board: tool({
    description: 'Update a board name.',
    inputSchema: z.object({
      boardId: z.string().guid().describe('Board UUID'),
      name: z.string().describe('New board name'),
    }),
  }),

  delete_board: tool({
    description: 'Delete a task board.',
    inputSchema: z.object({
      boardId: z.string().guid().describe('Board UUID'),
    }),
  }),

  list_task_lists: tool({
    description: 'List columns/lists within a specific board.',
    inputSchema: z.object({
      boardId: z.string().guid().describe('Board UUID'),
    }),
  }),

  create_task_list: tool({
    description: 'Create a new list/column in a board.',
    inputSchema: z.object({
      boardId: z.string().guid().describe('Board UUID'),
      name: z.string().describe('List name'),
      color: z
        .string()
        .regex(colorHexRegex, 'Color must be a valid hex code')
        .optional()
        .describe('Color hex code'),
    }),
  }),

  update_task_list: tool({
    description: 'Update a task list.',
    inputSchema: z.object({
      listId: z.string().guid().describe('List UUID'),
      name: z.string().optional().describe('New name'),
      color: z
        .string()
        .regex(colorHexRegex, 'Color must be a valid hex code')
        .optional()
        .describe('New color'),
      position: z.number().int().optional().describe('New sort position'),
    }),
  }),

  delete_task_list: tool({
    description: 'Delete a task list.',
    inputSchema: z.object({
      listId: z.string().guid().describe('List UUID'),
    }),
  }),

  list_task_labels: tool({
    description: 'List all task labels in the workspace.',
    inputSchema: z.object({}),
  }),

  create_task_label: tool({
    description: 'Create a task label.',
    inputSchema: z.object({
      name: z.string().describe('Label name'),
      color: z
        .string()
        .regex(colorHexRegex, 'Color must be a valid hex code')
        .optional()
        .describe('Color hex code'),
    }),
  }),

  update_task_label: tool({
    description: 'Update a task label.',
    inputSchema: z.object({
      labelId: z.string().guid().describe('Label UUID'),
      name: z.string().optional().describe('New name'),
      color: z
        .string()
        .regex(colorHexRegex, 'Color must be a valid hex code')
        .optional()
        .describe('New color'),
    }),
  }),

  delete_task_label: tool({
    description: 'Delete a task label.',
    inputSchema: z.object({
      labelId: z.string().guid().describe('Label UUID'),
    }),
  }),

  add_task_labels: tool({
    description: 'Assign one or more labels to a task.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('Task UUID'),
      labelIds: z
        .array(z.string().guid())
        .min(1)
        .describe('Label UUIDs to add'),
    }),
  }),

  remove_task_labels: tool({
    description: 'Remove one or more labels from a task.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('Task UUID'),
      labelIds: z
        .array(z.string().guid())
        .min(1)
        .describe('Label UUIDs to remove'),
    }),
  }),

  list_projects: tool({
    description: 'List all projects in the workspace.',
    inputSchema: z.object({}),
  }),

  create_project: tool({
    description: 'Create a new project.',
    inputSchema: z.object({
      name: z.string().describe('Project name'),
      description: z.string().optional().describe('Project description'),
    }),
  }),

  update_project: tool({
    description: 'Update a project.',
    inputSchema: z.object({
      projectId: z.string().guid().describe('Project UUID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    }),
  }),

  delete_project: tool({
    description: 'Delete a project.',
    inputSchema: z.object({
      projectId: z.string().guid().describe('Project UUID'),
    }),
  }),

  add_task_to_project: tool({
    description: 'Link a task to a project.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('Task UUID'),
      projectId: z.string().guid().describe('Project UUID'),
    }),
  }),

  remove_task_from_project: tool({
    description: 'Unlink a task from a project.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('Task UUID'),
      projectId: z.string().guid().describe('Project UUID'),
    }),
  }),

  add_task_assignee: tool({
    description:
      'Assign a user to a task. Use list_workspace_members to find user IDs.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('Task UUID'),
      userId: z.string().guid().describe('User UUID to assign'),
    }),
  }),

  remove_task_assignee: tool({
    description: 'Remove a user from a task.',
    inputSchema: z.object({
      taskId: z.string().guid().describe('Task UUID'),
      userId: z.string().guid().describe('User UUID to remove'),
    }),
  }),
} as const;
