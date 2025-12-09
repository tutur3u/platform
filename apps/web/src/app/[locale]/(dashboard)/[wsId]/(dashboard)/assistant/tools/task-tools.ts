import type { LiveFunctionDeclaration, LiveTool } from '../multimodal-live';

/**
 * Function declarations for task management tools
 * Uses Type enum from @google/genai for proper schema typing
 */
export const taskToolDeclarations: LiveFunctionDeclaration[] = [
  {
    name: 'get_my_tasks',
    description:
      'Get all tasks assigned to or accessible by the current user. Returns tasks categorized by overdue, due today, and upcoming.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description:
            'Optional filter: "overdue" for past-due tasks, "today" for tasks due today, "upcoming" for future tasks, or "all" (default) for all tasks.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_tasks',
    description:
      'Search for tasks by keywords or natural language. Returns matching tasks with similarity scores.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The search query - keywords or natural language.',
        },
        matchCount: {
          type: 'NUMBER',
          description: 'Maximum number of results to return. Default is 10.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the workspace.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: {
          type: 'STRING',
          description: 'The name/title of the task.',
        },
        description: {
          type: 'STRING',
          description: 'Optional detailed description of the task.',
        },
        priority: {
          type: 'STRING',
          description: 'Task priority: "low", "normal", "high", or "critical".',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_task',
    description:
      'Update an existing task - name, description, priority, or mark as completed.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskId: {
          type: 'STRING',
          description: 'The unique ID of the task to update.',
        },
        name: {
          type: 'STRING',
          description: 'New name for the task.',
        },
        description: {
          type: 'STRING',
          description: 'New description for the task.',
        },
        priority: {
          type: 'STRING',
          description: 'New priority: "low", "normal", "high", or "critical".',
        },
        completed: {
          type: 'BOOLEAN',
          description: 'Set to true to mark task as completed.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete (move to trash) an existing task.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskId: {
          type: 'STRING',
          description: 'The unique ID of the task to delete.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_task_details',
    description:
      'Get detailed information about a specific task including labels and assignees.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskId: {
          type: 'STRING',
          description: 'The unique ID of the task.',
        },
      },
      required: ['taskId'],
    },
  },
];

/**
 * Tool configuration for the Live API
 */
export const taskTools: LiveTool[] = [
  { functionDeclarations: taskToolDeclarations },
  // { googleSearch: {} }, // Temporarily disabled to debug tool access
];
