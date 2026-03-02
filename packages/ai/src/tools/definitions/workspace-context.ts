import { z } from 'zod';
import { tool } from '../core';

export const workspaceContextToolDefinitions = {
  list_accessible_workspaces: tool({
    description:
      'List all workspaces the user can access, including member counts. Use this before switching workspace context.',
    inputSchema: z.object({}),
  }),

  get_workspace_context: tool({
    description:
      'Show the current workspace context used for personal task, calendar, and finance queries. Defaults to the personal workspace.',
    inputSchema: z.object({}),
  }),

  set_workspace_context: tool({
    description:
      'Switch the current workspace context for task, calendar, and finance tools. Use `list_accessible_workspaces` first to get the target workspace ID. Use `personal` to switch back to the personal workspace.',
    inputSchema: z.object({
      workspaceId: z
        .string()
        .trim()
        .min(1)
        .describe('Target workspace ID or `personal`.'),
    }),
  }),
} as const;
