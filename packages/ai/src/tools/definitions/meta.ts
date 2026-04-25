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
      'Pick which tools you need for this request. You may stream a short text acknowledgement first when useful, then call this before using other Mira tools. Choose from the available tool names listed in the system prompt. Use no_action_needed ONLY for truly conversational turns with no durable info to save and no real-world lookup needed.',
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

  run_parallel_checks: tool({
    description:
      'Run lightweight parallel subagents for complex verification, planning, risk review, or conflicting-assumption checks. Use this for explicit deep verification requests instead of enabling main-assistant reasoning by default.',
    inputSchema: z.object({
      question: requiredTrimmedString(2000, 'question').describe(
        'The exact question, plan, claim, or scenario to verify.'
      ),
      context: z
        .string()
        .trim()
        .max(8000)
        .optional()
        .describe(
          'Optional relevant context from the conversation or tool results.'
        ),
      checks: z
        .array(z.enum(['assumptions', 'factuality', 'risk', 'implementation']))
        .min(1)
        .max(4)
        .optional()
        .describe(
          'Optional focused checks to run in parallel. Defaults to assumptions, factuality, and risk.'
        ),
    }),
    toModelOutput: ({ output }) => {
      if (!output || typeof output !== 'object') {
        return { type: 'text', value: 'Parallel checks completed.' };
      }

      const result = output as {
        ok?: boolean;
        summary?: string;
        checks?: Array<{ label?: string; finding?: string }>;
        error?: string;
      };

      if (result.ok === false) {
        return {
          type: 'text',
          value: result.error ?? 'Parallel checks failed.',
        };
      }

      const checkLines =
        result.checks
          ?.map((check) =>
            check.label && check.finding
              ? `- ${check.label}: ${check.finding}`
              : null
          )
          .filter((line): line is string => line !== null)
          .join('\n') ?? '';

      return {
        type: 'text',
        value: [result.summary, checkLines].filter(Boolean).join('\n'),
      };
    },
  }),

  convert_file_to_markdown: tool({
    description:
      'Convert an attached chat file (Excel, Word, PowerPoint, PDF, etc.) to markdown via MarkItDown. Do not use this for YouTube links; Google/Gemini models receive YouTube URLs as native video input.',
    inputSchema: z.object({
      url: optionalTrimmedString(2048, 'url').describe(
        'Deprecated. Do not use for YouTube summaries; the chat request pipeline attaches YouTube URLs directly to Google/Gemini models as video input.'
      ),
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
