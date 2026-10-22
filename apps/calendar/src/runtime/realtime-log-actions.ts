import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const realtimeLogInput = z.object({
  wsId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  kind: z.string().max(128),
  message: z.string().max(4000),
  data: z.unknown().optional(),
});

const recordRealtimeLog = createServerFn({ method: 'POST' })
  .validator(realtimeLogInput)
  .handler(async ({ data }) => {
    const { recordAuthorizedRealtimeLog } = await import(
      './realtime-log-supplier.server'
    );
    return recordAuthorizedRealtimeLog(data);
  });

export function addRealtimeLog(
  wsId: string,
  userId: string | null,
  kind: string,
  message: string,
  data?: unknown
) {
  return recordRealtimeLog({ data: { wsId, userId, kind, message, data } });
}
