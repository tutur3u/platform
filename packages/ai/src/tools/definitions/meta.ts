import { z } from 'zod';
import { tool } from '../core';
import { MIRA_TOOL_NAMES } from '../mira-tool-names';

const validToolSet = new Set<string>(MIRA_TOOL_NAMES);

const requiredTrimmedString = (max: number, field: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1, `${field} cannot be blank`).max(max)
  );

const optionalTrimmedString = (max: number, field: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1, `${field} cannot be blank`).max(max).optional()
  );

export const metaToolDefinitions = {
  select_tools: tool({
    description:
      'Pick which tools you need for this user turn. Call this once before using action tools, then reuse the selected set without calling it again unless you truly need to add or remove tools. Use no_action_needed ONLY for conversational/file-understanding turns with no durable info to save and no real-world lookup needed.',
    inputSchema: z.object({
      tools: z
        .array(z.string())
        .min(1)
        .refine(
          (tools) => tools.every((toolName) => validToolSet.has(toolName)),
          {
            message: 'Invalid tool name(s)',
          }
        )
        .refine((tools) => new Set(tools).size === tools.length, {
          message: 'Duplicate tools are not allowed',
        })
        .refine(
          (tools) => !tools.includes('no_action_needed') || tools.length === 1,
          {
            message: 'no_action_needed must be selected by itself',
          }
        )
        .describe(
          'Array of tool names to activate (e.g. ["get_my_tasks", "create_task"]). Include all tools you expect to call.'
        ),
    }),
  }),

  no_action_needed: tool({
    description:
      'Call only when the user turn needs no action tools beyond normal answering. Do not use it when the user explicitly asked to persist preferences, identity, settings, memory, or to fetch real-time external information.',
    inputSchema: z.object({
      reason: z
        .string()
        .trim()
        .min(1, 'reason cannot be blank')
        .describe('Brief reason (e.g. "user said thanks")'),
    }),
  }),

  google_search: tool({
    description:
      'Search the public web for current, real-time information such as news, pricing, weather, and up-to-date facts.',
    inputSchema: z.object({
      query: requiredTrimmedString(500, 'query').describe(
        'Search query for web lookup'
      ),
    }),
  }),

  list_chat_files: tool({
    description:
      'List files that have been uploaded in the current chat so you can reference only the relevant ones by name before loading, converting, or discussing them. This tool does not inspect file contents.',
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Optional maximum number of files to return. Default is 20.'),
      latestFirst: z
        .boolean()
        .optional()
        .describe('Optional sort order. Defaults to true for newest first.'),
      query: optionalTrimmedString(255, 'query').describe(
        'Optional filename, alias, or MIME query to narrow the result set.'
      ),
    }),
  }),

  load_chat_file: tool({
    description:
      'Load the digested understanding of one earlier chat file so you can analyze the actual contents before answering. Use this for prior-turn audio, image, video, PDF, text, or document files.',
    inputSchema: z.object({
      fileName: optionalTrimmedString(255, 'fileName').describe(
        'Optional current filename or alias. Use list_chat_files first if you need to inspect the available files.'
      ),
      forceRefresh: z
        .boolean()
        .optional()
        .describe(
          'Optional retry switch. Set true when a previous digest failed or when you need a fresh re-digest instead of cached analysis.'
        ),
      storagePath: optionalTrimmedString(1024, 'storagePath').describe(
        'Optional exact storage path. Prefer this when multiple files share a similar name.'
      ),
    }),
  }),

  rename_chat_file: tool({
    description:
      'Rename a chat file by updating its display alias. This tool does not inspect file contents. If the new name depends on understanding a file, load that file digest first.',
    inputSchema: z
      .object({
        fileName: optionalTrimmedString(255, 'fileName').describe(
          'Optional current filename or alias. Use list_chat_files first if you need to inspect the available files.'
        ),
        newName: requiredTrimmedString(255, 'newName').describe(
          'New display name/alias for the file.'
        ),
        storagePath: optionalTrimmedString(1024, 'storagePath').describe(
          'Optional exact storage path. Prefer this when multiple files share a similar name.'
        ),
      })
      .refine((value) => Boolean(value.fileName || value.storagePath), {
        message:
          'Provide either fileName or storagePath to identify which file to rename.',
        path: ['fileName'],
      }),
  }),

  convert_file_to_markdown: tool({
    description:
      'Convert attached office/document chat files (Excel, Word, PowerPoint, PDF, etc.) to markdown via MarkItDown when the user explicitly needs raw extracted text. Do not use for audio, image, or video inputs.',
    inputSchema: z.object({
      storagePath: optionalTrimmedString(1024, 'storagePath').describe(
        'Optional full storage path. If omitted, the latest document attachment from the current user turn is preferred, then the chat fallback is used.'
      ),
      fileName: optionalTrimmedString(255, 'fileName').describe(
        'Optional filename from current chat attachments or from list_chat_files results (for example: "report.xlsx"). Used when storagePath is not provided.'
      ),
      maxCharacters: z
        .number()
        .int()
        .min(2000)
        .max(300000)
        .optional()
        .describe(
          'Optional markdown output cap for token safety. Default is 120000.'
        ),
    }),
  }),
} as const;
