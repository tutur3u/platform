import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Server functions standing in for the `'use server'` modules client code
 * imports (Start has no server-action RPC). `vite.config.mts` swaps each
 * original module for this one in the native build only; the Next build is
 * unchanged.
 */

export const fetchWorkspaces = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { fetchAuthorizedWorkspaces } = await import('./action-ports.server');
    return fetchAuthorizedWorkspaces();
  }
);
export const fetchSatelliteWorkspaces = fetchWorkspaces;

export const listPublicBoardTemplates = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { listAuthorizedPublicBoardTemplates } = await import(
    './action-ports.server'
  );
  return listAuthorizedPublicBoardTemplates();
});

const realtimeLogInput = z.object({
  wsId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  kind: z.string().max(128),
  message: z.string().max(4000),
  data: z.json().optional(),
});

const recordRealtimeLog = createServerFn({ method: 'POST' })
  .validator(realtimeLogInput)
  .handler(async ({ data }) => {
    const { recordAuthorizedRealtimeLog } = await import(
      './action-ports.server'
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
  return recordRealtimeLog({
    data: {
      wsId,
      userId,
      kind,
      message,
      data: data as z.infer<typeof realtimeLogInput>['data'],
    },
  });
}
