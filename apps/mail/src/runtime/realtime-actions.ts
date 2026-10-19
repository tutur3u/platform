import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const addLog = createServerFn({ method: 'POST' })
  .validator(
    z.tuple([
      z.uuid(),
      z.uuid().nullable(),
      z.string().max(64),
      z.string().max(16384),
      z.unknown().optional(),
    ])
  )
  .handler(async ({ data }) => {
    const { submitRealtimeLog } = await import('./realtime-actions.server');
    return submitRealtimeLog(data);
  });
export function addRealtimeLog(
  wsId: string,
  userId: string | null,
  kind: string,
  message: string,
  data?: unknown
) {
  return addLog({ data: [wsId, userId, kind, message, data] });
}
