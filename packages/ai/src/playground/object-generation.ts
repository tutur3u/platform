import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export type Task = z.infer<typeof generateTaskSchema>['tasks'];

export const generateTaskSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      howToComplete: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
    })
  ),
});

export const generateTask = async () => {
  return await generateObject({
    model: google('gemini-2.0-flash'),
    schema: generateTaskSchema,
    prompt:
      'add active sync (sync google to tuturuuu); add background sync using cron job and queues; remove legacy use hook synchronization logic',
  });
};
