import { z } from 'zod';
import { tool } from '../core';

type SettingsLikeData = {
  name?: unknown;
  tone?: unknown;
  personality?: unknown;
  boundaries?: unknown;
  vibe?: unknown;
  chat_tone?: unknown;
  displayName?: unknown;
  fullName?: unknown;
};

const hasAtLeastOneFieldProvided = (data: SettingsLikeData): boolean =>
  [
    data.name,
    data.tone,
    data.personality,
    data.boundaries,
    data.vibe,
    data.chat_tone,
    data.displayName,
    data.fullName,
  ].some((value) => value !== null && value !== undefined);

export const workspaceUserChatToolDefinitions = {
  update_my_settings: tool({
    description:
      "Update YOUR OWN (the assistant's) personality. The `name` field is YOUR name, not the user's. Use `remember` for user's name.",
    inputSchema: z
      .object({
        name: z.string().max(50).nullish().describe('New assistant name'),
        tone: z
          .enum([
            'balanced',
            'casual',
            'formal',
            'friendly',
            'playful',
            'professional',
            'warm',
          ])
          .nullish()
          .describe('Communication tone'),
        personality: z
          .string()
          .max(2000)
          .nullish()
          .describe('Personality description / behavioral preferences'),
        boundaries: z
          .string()
          .max(2000)
          .nullish()
          .describe('Custom boundaries'),
        vibe: z
          .enum([
            'calm',
            'energetic',
            'friendly',
            'neutral',
            'playful',
            'warm',
            'witty',
          ])
          .nullish()
          .describe('Energy/vibe'),
        chat_tone: z
          .enum(['thorough', 'concise', 'detailed', 'brief'])
          .nullish()
          .describe('Response verbosity'),
      })
      .refine((data) => hasAtLeastOneFieldProvided(data), {
        message: 'At least one field must be provided',
      }),
  }),

  set_theme: tool({
    description:
      'Switch the UI theme. Use when user asks for dark mode, light mode, or system theme.',
    inputSchema: z.object({
      theme: z.enum(['light', 'dark', 'system']).describe('Theme to apply'),
    }),
  }),

  list_workspace_members: tool({
    description:
      'List all members of the current workspace context from `workspace_members`. Use `get_workspace_context` to inspect the active workspace first, and `list_accessible_workspaces` + `set_workspace_context` when the user names another workspace.',
    inputSchema: z.object({}),
  }),

  update_user_name: tool({
    description: "Update the user's display name or full name.",
    inputSchema: z
      .object({
        displayName: z.string().nullish().describe('New display name'),
        fullName: z.string().nullish().describe('New full name'),
      })
      .refine((data) => hasAtLeastOneFieldProvided(data), {
        message: 'At least one field must be provided',
      }),
  }),

  set_immersive_mode: tool({
    description:
      'Enter or exit immersive fullscreen mode for the current chat.',
    inputSchema: z.object({
      enabled: z.boolean().describe('Whether to enable immersive mode'),
    }),
  }),
} as const;
