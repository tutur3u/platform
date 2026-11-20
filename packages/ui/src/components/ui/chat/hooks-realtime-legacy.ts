import type { ChatRealtimeCacheEvent } from './hooks-realtime-cache';

/** Frames from the local Bun sidecar, proxied by the Web API as SSE. */
export type LegacyChatStreamEvent =
  | ChatRealtimeCacheEvent
  | { type: 'ping' }
  | { type: 'ready' }
  | {
      conversationId?: string | null;
      isTyping: boolean;
      type: 'typing.updated';
    }
  | {
      conversationId?: string | null;
      isOnline: boolean;
      type: 'presence.updated';
    }
  | { error?: string; type: 'error' };

function parseLegacyEvent(data: string): LegacyChatStreamEvent | null {
  try {
    const parsed = JSON.parse(data) as LegacyChatStreamEvent;
    return typeof parsed?.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Opens the SSE stream the Web API serves when no Worker origin is set
 * (local development with the sidecar). Starts a 30 s refetch when the stream
 * is unavailable. Returns a disposer.
 */
export function openLegacyChatStream(
  wsId: string,
  handlers: {
    onEvent: (event: LegacyChatStreamEvent) => void;
    refetch: () => void;
  }
) {
  const source = new EventSource(
    `/api/v1/workspaces/${encodeURIComponent(wsId)}/chat/realtime`
  );
  let fallbackTimer: ReturnType<typeof setInterval> | undefined;
  const startFallback = () => {
    if (fallbackTimer !== undefined) return;
    handlers.refetch();
    fallbackTimer = setInterval(handlers.refetch, 30_000);
  };

  source.onerror = startFallback;
  source.onopen = () => {
    clearInterval(fallbackTimer);
    fallbackTimer = undefined;
    handlers.refetch();
  };
  source.onmessage = (message) => {
    const event = parseLegacyEvent(message.data);
    if (!event || event.type === 'ping' || event.type === 'ready') return;
    if (event.type === 'error') {
      source.close();
      startFallback();
      return;
    }
    handlers.onEvent(event);
  };

  return () => {
    source.close();
    clearInterval(fallbackTimer);
  };
}
