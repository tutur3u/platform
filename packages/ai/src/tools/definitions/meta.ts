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
      'Pick which tools you need for this request. You MUST call this as your FIRST action every turn. Choose from the available tool names listed in the system prompt. Use no_action_needed ONLY for truly conversational turns with no durable info to save and no real-world lookup needed.',
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
      'Call only when the message is purely conversational and requires NO real action (no settings/memory updates, no search, no data/tool operation).',
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

  convert_file_to_markdown: tool({
    description:
      'Convert an attached chat file (Excel, Word, PowerPoint, PDF, etc.) to markdown via MarkItDown.',
    inputSchema: z.object({
      storagePath: optionalTrimmedString(1024, 'storagePath').describe(
        'Optional full storage path. If omitted, the latest file from the current chat is converted.'
      ),
      fileName: optionalTrimmedString(255, 'fileName').describe(
        'Optional filename from current chat attachments (for example: "report.xlsx"). Used when storagePath is not provided.'
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
