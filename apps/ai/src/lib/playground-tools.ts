import { type ToolSet, tool } from 'ai';
import { z } from 'zod';

export const playgroundToolNames = ['calculator', 'current_time'] as const;
export type PlaygroundToolName = (typeof playgroundToolNames)[number];

const calculator = tool({
  description:
    'Perform a single deterministic arithmetic operation on two numbers.',
  execute: async ({
    left,
    operation,
    right,
  }: {
    left: number;
    operation: 'add' | 'divide' | 'multiply' | 'subtract';
    right: number;
  }) => {
    if (operation === 'divide' && right === 0) {
      return { error: 'Division by zero is not defined.' };
    }
    const value =
      operation === 'add'
        ? left + right
        : operation === 'subtract'
          ? left - right
          : operation === 'multiply'
            ? left * right
            : left / right;
    return { value };
  },
  inputSchema: z.object({
    left: z.number().finite(),
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    right: z.number().finite(),
  }),
});

const currentTime = tool({
  description: 'Return the current time in a valid IANA time zone.',
  execute: async ({ timeZone }: { timeZone: string }) => {
    try {
      return {
        iso: new Date().toISOString(),
        local: new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone,
        }).format(new Date()),
        timeZone,
      };
    } catch {
      return { error: 'The supplied IANA time zone is invalid.', timeZone };
    }
  },
  inputSchema: z.object({
    timeZone: z.string().min(1).max(80),
  }),
});

const availableTools = {
  calculator,
  current_time: currentTime,
} satisfies ToolSet;

export function resolvePlaygroundTools(names: PlaygroundToolName[]): ToolSet {
  return Object.fromEntries(
    names.map((name) => [name, availableTools[name]])
  ) as ToolSet;
}
