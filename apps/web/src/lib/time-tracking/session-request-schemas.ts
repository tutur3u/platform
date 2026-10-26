import { z } from 'zod';
import { sessionTagsSchema } from './session-tags';

/** Request schemas for the workspace time-tracking sessions route. */
export const cursorSchema = z.object({
  lastStartTime: z.iso.datetime({ offset: true }),
  lastId: z.guid().or(z.string().regex(/^\d+$/)),
});

export const sessionCreateSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  categoryId: z.guid().nullable().optional(),
  taskId: z.guid().nullable().optional(),
  startTime: z.iso.datetime({ offset: true }).optional(),
  endTime: z.iso.datetime({ offset: true }).optional(),
  // Session tags, such as `pomodoro` on Pomodoro focus sessions.
  tags: sessionTagsSchema.optional(),
});

export type SessionRequestBody = z.infer<typeof sessionCreateSchema>;
