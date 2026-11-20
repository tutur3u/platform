'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { ChatConversation } from '@tuturuuu/internal-api';
import {
  type ChatRealtimeConnection,
  type ChatRealtimeConnectionStatus,
  createWorkspaceChatRealtimeConnection,
} from '@tuturuuu/internal-api/chat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyChatRealtimeEvent,
  type ChatRealtimeCacheEvent,
  invalidateConversationList,
  invalidateConversationMessages,
  refetchActiveChat,
  updateConversationSet,
} from './hooks-realtime-cache';
import { openLegacyChatStream } from './hooks-realtime-legacy';

const LIST_POLL_MS = 60_000;
const CONVERSATION_POLL_MS = 15_000;
const TYPING_TTL_MS = 4_000;
const ROOM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Retries a polling connection when the page returns or the network does. */
function watchForeground(onForeground: (visible: boolean) => void) {
  const onVisibility = () =>
    onForeground(document.visibilityState === 'visible');
  const onOnline = () => onForeground(true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
  };
}

function startPolling(
  status: ChatRealtimeConnectionStatus,
  intervalMs: number,
  refetch: () => void
) {
  if (status !== 'polling') return undefined;
  refetch();
  return setInterval(refetch, intervalMs);
}

function useTypingState() {
  const timeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const set = useCallback((conversationId: string, isTyping: boolean) => {
    const existing = timeouts.current.get(conversationId);
    if (existing) clearTimeout(existing);
    timeouts.current.delete(conversationId);
    setIds((current) =>
      updateConversationSet(current, conversationId, isTyping)
    );
    if (!isTyping) return;
    timeouts.current.set(
      conversationId,
      setTimeout(() => {
        timeouts.current.delete(conversationId);
        setIds((current) =>
          updateConversationSet(current, conversationId, false)
        );
      }, TYPING_TTL_MS)
    );
  }, []);
  useEffect(() => {
    const timers = timeouts.current;
    return () => {
      for (const timeout of timers.values()) clearTimeout(timeout);
      timers.clear();
    };
  }, []);
  return [ids, set] as const;
}

/**
 * Live chat delivery. The workspace inbox socket keeps the conversation list
 * fresh and reports online members; the open conversation's socket carries
 * full message events and typing. Without a Worker the Web API's local stream
 * is used, and after repeated socket failures the hook polls (60 s for the
 * list, 15 s for the open conversation) until the page or network returns.
 */
export function useChatRealtime(
  wsId: string,
  options: {
    activeConversationId?: string | null;
    conversations?: readonly ChatConversation[];
  } = {}
) {
  const queryClient = useQueryClient();
  const { activeConversationId, conversations } = options;
  const [typingConversationIds, setTyping] = useTypingState();
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [legacyOnlineIds, setLegacyOnlineIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [selfUserId, setSelfUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!wsId || typeof window === 'undefined') return;
    let closeLegacy: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const connection = createWorkspaceChatRealtimeConnection(wsId, {
      onFrame: (frame) => {
        if (frame.t === 'event') {
          applyChatRealtimeEvent(
            queryClient,
            wsId,
            frame.event as ChatRealtimeCacheEvent
          );
        } else if (frame.t === 'online') {
          setOnlineUserIds((current) =>
            updateConversationSet(current, frame.userId, frame.on)
          );
        }
      },
      onReady: (frame) => {
        setSelfUserId(frame.userId);
        setOnlineUserIds(new Set(frame.online ?? []));
      },
      onResync: () => refetchActiveChat(queryClient, wsId),
      onStatus: (status) => {
        clearInterval(poll);
        poll = startPolling(status, LIST_POLL_MS, () =>
          invalidateConversationList(queryClient, wsId)
        );
        if (status === 'disabled') {
          closeLegacy = openLegacyChatStream(wsId, {
            onEvent: (event) =>
              applyLegacyEvent(queryClient, wsId, event, {
                setOnline: setLegacyOnlineIds,
                setTyping,
              }),
            refetch: () => refetchActiveChat(queryClient, wsId),
          });
        }
      },
    });
    const stopWatching = watchForeground(
      (visible) => visible && connection.retry()
    );
    return () => {
      stopWatching();
      connection.close();
      clearInterval(poll);
      closeLegacy?.();
    };
  }, [queryClient, setTyping, wsId]);

  useEffect(() => {
    const conversationId = activeConversationId;
    if (
      !wsId ||
      !conversationId ||
      !ROOM_ID_PATTERN.test(conversationId) ||
      typeof window === 'undefined'
    )
      return;
    let poll: ReturnType<typeof setInterval> | undefined;
    let connection: ChatRealtimeConnection | null = null;
    let self: string | null = null;
    const reportPresence = () =>
      connection?.send({
        state:
          document.visibilityState === 'visible' ? 'foreground' : 'background',
        t: 'presence',
      });
    connection = createWorkspaceChatRealtimeConnection(wsId, {
      conversationId,
      onFrame: (frame) => {
        if (frame.t === 'event') {
          if (frame.event.type === 'typing.updated') {
            if (frame.event.actorUserId !== self)
              setTyping(conversationId, frame.event.isTyping);
            return;
          }
          applyChatRealtimeEvent(
            queryClient,
            wsId,
            frame.event as ChatRealtimeCacheEvent
          );
        } else if (frame.t === 'typing' && frame.userId !== self) {
          setTyping(conversationId, frame.on);
        }
      },
      onReady: (frame) => {
        self = frame.userId;
        if (document.visibilityState !== 'visible') reportPresence();
      },
      onResync: () => {
        invalidateConversationMessages(queryClient, wsId, conversationId);
        invalidateConversationList(queryClient, wsId);
      },
      onStatus: (status) => {
        clearInterval(poll);
        poll = startPolling(status, CONVERSATION_POLL_MS, () =>
          invalidateConversationMessages(queryClient, wsId, conversationId)
        );
      },
    });
    const stopWatching = watchForeground((visible) => {
      reportPresence();
      if (visible) connection?.retry();
    });
    return () => {
      stopWatching();
      connection?.close();
      clearInterval(poll);
      setTyping(conversationId, false);
    };
  }, [activeConversationId, queryClient, setTyping, wsId]);

  const onlineConversationIds = useMemo(() => {
    if (!onlineUserIds.size) return legacyOnlineIds;
    const ids = new Set(legacyOnlineIds);
    for (const conversation of conversations ?? []) {
      if (conversation.type !== 'direct') continue;
      if (
        conversation.members.some(
          (member) =>
            member.userId !== selfUserId && onlineUserIds.has(member.userId)
        )
      )
        ids.add(conversation.id);
    }
    return ids;
  }, [conversations, legacyOnlineIds, onlineUserIds, selfUserId]);

  return { onlineConversationIds, typingConversationIds };
}

function applyLegacyEvent(
  queryClient: QueryClient,
  wsId: string,
  event: Parameters<Parameters<typeof openLegacyChatStream>[1]['onEvent']>[0],
  setters: {
    setOnline: (
      update: (current: ReadonlySet<string>) => ReadonlySet<string>
    ) => void;
    setTyping: (conversationId: string, isTyping: boolean) => void;
  }
) {
  if (event.type === 'typing.updated') {
    if (event.conversationId)
      setters.setTyping(event.conversationId, event.isTyping);
    return;
  }
  if (event.type === 'presence.updated') {
    const conversationId = event.conversationId;
    if (conversationId)
      setters.setOnline((current) =>
        updateConversationSet(current, conversationId, event.isOnline)
      );
    return;
  }
  if (
    event.type === 'ping' ||
    event.type === 'ready' ||
    event.type === 'error'
  ) {
    return;
  }
  applyChatRealtimeEvent(queryClient, wsId, event);
}
