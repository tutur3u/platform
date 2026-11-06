import { z } from 'zod';
import { sessionTagsSchema } from './session-tags';

/** Request schemas for the workspace time-tracking sessions route. */
export const cursorSchema = z.object({
  lastStartTime: z.iso.datetime({ offset: true }),
  lastId: z.guid().or(z.string().regex(/^\d+$/)),
});

export const sessionCreateSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    categoryId: z.guid().nullable().optional(),
    taskId: z.guid().nullable().optional(),
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
    // Session tags, such as `pomodoro` on Pomodoro focus sessions.
    tags: sessionTagsSchema.optional(),
  })
  .refine(
    // Manual entries (startTime/endTime) are written by an insert function
    // that cannot store tags, so tags there are rejected, never dropped.
    (body) => !body.tags?.length || (!body.startTime && !body.endTime),
    {
      message: 'Tags can only be set when starting a running session',
      path: ['tags'],
    }
  );

export type SessionRequestBody = z.infer<typeof sessionCreateSchema>;
