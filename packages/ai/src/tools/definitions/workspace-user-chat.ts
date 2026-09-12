import { z } from 'zod';
import {
  manageWorkspaceSchema,
  showWorkspaceArtifactSchema,
} from '../../workspace-artifacts';
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

  set_sidebar: tool({
    description:
      'Set the navigation sidebar to expanded, collapsed, hover (expand on hover), or hidden. Apply immediately when asked.',
    inputSchema: z.object({
      behavior: z.enum(['expanded', 'collapsed', 'hover', 'hidden']),
    }),
  }),

  show_workspace_artifact: tool({
    description:
      'Open or update a tailored artifact beside chat. Choose tasks, calendar, finance, or meetings. Use presentation for a concise title, search, taskStatus, currency, date, or specific itemIds. Opening multiple panels splits the space automatically. Omit layout to preserve the current arrangement. Use proactively when a visual view helps the task; no toolbar click is needed. The panel displays product cards without explanatory prose; keep recommendations in chat. This tool does not read product data: use only a title unless a data-read tool returned the facts in this turn. On success the opening/update is complete; do not repeat it to verify.',
    inputSchema: showWorkspaceArtifactSchema,
  }),

  manage_workspace: tool({
    description:
      'Manage screen space: close_artifact closes the selected kind in this workspace, close_all returns to full chat, focus_artifact keeps only the chosen artifact, and set_layout changes the split. horizontal is side by side, vertical is stacked, grid gives chat one quarter with multiple panels. focus_artifact closes every other panel, so never use it when the user asks to keep other panels. Replace one panel with close_artifact plus show_workspace_artifact. Call each required action once; success means it is complete, so finish after the requested actions succeed.',
    inputSchema: manageWorkspaceSchema,
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
