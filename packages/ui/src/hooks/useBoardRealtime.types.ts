import type { createClient } from '@tuturuuu/supabase/next/client';

export type RealtimeChannel = ReturnType<
  ReturnType<typeof createClient>['channel']
>;

export type BoardRealtimePayload = Record<string, unknown> & {
  __tuturuuuBoardRealtimeEventId?: string;
  __tuturuuuBoardRealtimeOrigin?: string;
};

type BoardRealtimeEnvelope = {
  event: string;
  payload: BoardRealtimePayload;
};

export const LOCAL_BROADCAST_CHANNEL_PREFIX = 'tuturuuu:board-realtime';
export const SEEN_REALTIME_EVENT_LIMIT = 500;
export const PRIVATE_TASK_REALTIME_CHANNEL_CONFIG = {
  config: {
    broadcast: { self: false },
    private: true,
  },
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function isBoardRealtimeEnvelope(
  value: unknown
): value is BoardRealtimeEnvelope {
  return (
    isRecord(value) &&
    typeof value.event === 'string' &&
    isRecord(value.payload)
  );
}

let fallbackRealtimeClientCounter = 0;

export function createRealtimeClientId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  fallbackRealtimeClientCounter += 1;
  return `fallback-${Date.now().toString(36)}-${fallbackRealtimeClientCounter}`;
}
