import { google } from '@ai-sdk/google';
import { Tool, generateText, tool } from 'ai';
import dayjs from 'dayjs';
import { z } from 'zod';

const calculatePowerSchema = z.object({
  number: z.number().describe('The number to calculate the power of'),
  power: z.number().describe('The power to calculate the power of'),
});

const calculatePower = tool<typeof calculatePowerSchema, { result: number }>({
  description: 'Calculate the power of a number to the power of another number',
  parameters: calculatePowerSchema,
  execute: async ({ number, power }) => {
    return {
      result: number ** power,
    };
  },
});

export const toolCalling = async ({
  extraTools,
}: {
  extraTools?: Record<string, Tool<any, any>>;
} = {}) => {
  return await generateText({
    model: google('gemini-2.0-flash'),
    tools: {
      calculatePower,
      ...extraTools,
    },
    maxSteps: 15,
    // prompt: 'What is the power of 2 to the power of 100?',
    system: `
    - current date time is ${dayjs().format('YYYY-MM-DD HH:mm:ss')}.
    - Make sure all events are not clashing with each other.
    - Automatically add events to the calendar if needed.
    - Automatically move events to a new time without asking for confirmation.
    - Always double check if events are not clashing with each other before adding or moving events.
    - Always tell the user all events in the calendar after adding or moving events.
    - This week is from ${dayjs().startOf('week').format('YYYY-MM-DD')} to ${dayjs().endOf('week').format('YYYY-MM-DD')}
    `,
    prompt:
      'Make sure all events are not clashing with each other in this week.',
  });
};
