import { z } from 'zod';
import { tool } from '../core';

export const timeTrackingToolDefinitions = {
  start_timer: tool({
    description:
      'Start a time tracking session. Stops any currently running timer first.',
    inputSchema: z.object({
      title: z.string().describe('What are you working on?'),
      description: z
        .string()
        .nullish()
        .describe('Additional details, or null/omit'),
    }),
  }),

  stop_timer: tool({
    description: 'Stop the currently running time tracking session.',
    inputSchema: z.object({
      sessionId: z
        .string()
        .nullish()
        .describe('Session UUID, or null/omit for active session'),
    }),
  }),

  list_time_tracking_sessions: tool({
    description:
      'List your time tracking sessions with cursor pagination. By default pending approval sessions are excluded.',
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Page size (default 20, max 50)'),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response (start_time|id)'),
      includePending: z
        .boolean()
        .optional()
        .describe('Whether to include pending approval sessions'),
    }),
  }),

  get_time_tracking_session: tool({
    description:
      'Get one specific time tracking session by ID in the current workspace.',
    inputSchema: z
      .object({
        sessionId: z.string().optional().describe('Session UUID'),
        id: z
          .string()
          .optional()
          .describe('Alias for sessionId. Use either sessionId or id.'),
      })
      .refine((data) => Boolean(data.sessionId || data.id), {
        message: 'sessionId or id is required',
        path: ['sessionId'],
      }),
  }),

  create_time_tracking_entry: tool({
    description:
      'Create a manual (stopped) time tracking entry. If approval is required, it returns requiresApproval=true with next-step guidance for the user/UI to complete approval.',
    inputSchema: z.object({
      title: z.string().describe('Entry title'),
      description: z
        .string()
        .nullish()
        .describe('Entry description, or null/omit'),
      categoryId: z
        .string()
        .nullish()
        .describe('Time tracking category UUID, or null/omit'),
      taskId: z.string().nullish().describe('Task UUID, or null/omit'),
      startTime: z.iso
        .datetime()
        .describe('Start time (ISO 8601, YYYY-MM-DD HH:mm)'),
      endTime: z.iso
        .datetime()
        .describe('End time (ISO 8601, YYYY-MM-DD HH:mm)'),
    }),
  }),

  update_time_tracking_session: tool({
    description:
      'Update fields of an existing time tracking session. Recomputes duration when times change.',
    inputSchema: z
      .object({
        sessionId: z.string().optional().describe('Session UUID'),
        id: z
          .string()
          .optional()
          .describe('Alias for sessionId. Use either sessionId or id.'),
        title: z.string().optional().describe('Updated title'),
        description: z
          .string()
          .nullable()
          .optional()
          .describe('Updated description'),
        categoryId: z
          .string()
          .nullable()
          .optional()
          .describe('Updated category UUID'),
        taskId: z.string().nullable().optional().describe('Updated task UUID'),
        startTime: z.iso
          .datetime()
          .optional()
          .describe('Updated start time (ISO 8601, YYYY-MM-DD HH:mm)'),
        endTime: z.iso
          .datetime()
          .optional()
          .describe('Updated end time (ISO 8601, YYYY-MM-DD HH:mm)'),
      })
      .refine((data) => Boolean(data.sessionId || data.id), {
        message: 'sessionId or id is required',
        path: ['sessionId'],
      }),
  }),

  delete_time_tracking_session: tool({
    description: 'Delete a time tracking session by ID.',
    inputSchema: z
      .object({
        sessionId: z.string().optional().describe('Session UUID'),
        id: z
          .string()
          .optional()
          .describe('Alias for sessionId. Use either sessionId or id.'),
      })
      .refine((data) => Boolean(data.sessionId || data.id), {
        message: 'sessionId or id is required',
        path: ['sessionId'],
      }),
  }),

  move_time_tracking_session: tool({
    description:
      'Move a stopped session to another workspace after membership checks, with category/task remapping by name.',
    inputSchema: z
      .object({
        sessionId: z.string().optional().describe('Session UUID'),
        id: z
          .string()
          .optional()
          .describe('Alias for sessionId. Use either sessionId or id.'),
        targetWorkspaceId: z.string().describe('Destination workspace UUID'),
      })
      .refine((data) => Boolean(data.sessionId || data.id), {
        message: 'sessionId or id is required',
        path: ['sessionId'],
      }),
  }),

  get_time_tracker_stats: tool({
    description:
      'Get time-tracker summary stats (today/week/month/streak) and daily activity for insights.',
    inputSchema: z.object({
      timezone: z
        .string()
        .optional()
        .describe(
          'IANA timezone (defaults to your current chat timezone or UTC)'
        ),
      summaryOnly: z
        .boolean()
        .optional()
        .describe('When true, skip daily activity history (default true)'),
      daysBack: z
        .number()
        .int()
        .min(1)
        .max(3650)
        .optional()
        .describe(
          'How many days of daily activity to include when summaryOnly=false (default 365)'
        ),
    }),
  }),

  get_time_tracker_goals: tool({
    description:
      'List your time-tracker goals (optionally including inactive goals) and computed daily/weekly progress.',
    inputSchema: z.object({
      includeInactive: z
        .boolean()
        .optional()
        .describe('Include inactive goals (default false)'),
      timezone: z
        .string()
        .optional()
        .describe('IANA timezone used for progress calculations'),
      includeProgress: z
        .boolean()
        .optional()
        .describe(
          'Include daily/weekly progress percentages using current stats (default true)'
        ),
    }),
  }),

  list_time_tracking_categories: tool({
    description:
      'List time-tracking categories in the current workspace so you can map category names to category IDs.',
    inputSchema: z.object({
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response (name|id)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Page size (default 20, max 50)'),
    }),
  }),

  create_time_tracker_goal: tool({
    description:
      'Create a new time-tracker goal for the current workspace/user.',
    inputSchema: z.object({
      categoryId: z
        .string()
        .nullish()
        .describe(
          'Time tracking category UUID. Use "general", null, or omit for non-category goal.'
        ),
      dailyGoalMinutes: z
        .number()
        .int()
        .min(1)
        .describe('Required daily target in minutes (must be > 0)'),
      weeklyGoalMinutes: z
        .number()
        .int()
        .min(1)
        .nullish()
        .describe('Optional weekly target in minutes. Use null/omit to clear'),
      isActive: z.boolean().optional().describe('Whether goal is active'),
    }),
  }),

  update_time_tracker_goal: tool({
    description:
      'Update an existing time-tracker goal by goalId (or id alias).',
    inputSchema: z
      .object({
        goalId: z.string().optional().describe('Goal UUID'),
        id: z
          .string()
          .optional()
          .describe('Alias for goalId. Use either goalId or id.'),
        categoryId: z
          .string()
          .nullish()
          .describe(
            'Time tracking category UUID. Use "general", null, or empty to clear.'
          ),
        dailyGoalMinutes: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Updated daily target in minutes (must be > 0)'),
        weeklyGoalMinutes: z
          .number()
          .int()
          .min(1)
          .nullish()
          .describe('Updated weekly target in minutes. Use null/omit to clear'),
        isActive: z.boolean().optional().describe('Updated active flag'),
      })
      .refine((data) => Boolean(data.goalId || data.id), {
        message: 'goalId or id is required',
        path: ['goalId'],
      }),
  }),

  delete_time_tracker_goal: tool({
    description: 'Delete a time-tracker goal by goalId (or id alias).',
    inputSchema: z
      .object({
        goalId: z.string().optional().describe('Goal UUID'),
        id: z
          .string()
          .optional()
          .describe('Alias for goalId. Use either goalId or id.'),
      })
      .refine((data) => Boolean(data.goalId || data.id), {
        message: 'goalId or id is required',
        path: ['goalId'],
      }),
  }),
} as const;
