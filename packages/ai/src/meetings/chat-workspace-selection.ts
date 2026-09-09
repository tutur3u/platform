import { type ModelMessage, type ToolSet, tool } from 'ai';
import { z } from 'zod';
import { MIRA_TOOL_DIRECTORY } from '../tools/mira-tool-metadata';
import type { MiraToolName } from '../tools/mira-tool-names';

/** Send detailed workspace schemas only after the model selects relevant tools. */
export function selectMeetWorkspaceTools(
  tools: ToolSet,
  messages?: ModelMessage[]
) {
  const selected = new Set<string>();
  for (const message of messages ?? []) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === 'tool-call' && tools[part.toolName])
        selected.add(part.toolName);
    }
  }
  const names = Object.keys(tools);
  return {
    active: () => [...selected].slice(-8),
    selector: tool({
      description: `Choose relevant workspace tools before using them. Selection does not access data or perform changes. Available tools: ${names.map((name) => `${name}: ${MIRA_TOOL_DIRECTORY[name as MiraToolName] ?? name}`).join('; ')}`,
      inputSchema: z.object({
        names: z
          .array(z.string().refine((name) => !!tools[name]))
          .min(1)
          .max(8),
      }),
      execute: async ({ names: requested }) => {
        selected.clear();
        for (const name of requested) selected.add(name);
        return {
          enabled: requested,
          instruction:
            'Call the selected tool; workspace tool execution requires requester approval.',
        };
      },
    }),
  };
}
