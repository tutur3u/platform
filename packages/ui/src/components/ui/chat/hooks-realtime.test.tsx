import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ChatConversation } from '@tuturuuu/internal-api';
import type {
  ChatRealtimeConnectionStatus,
  ChatRealtimeServerFrame,
} from '@tuturuuu/internal-api/chat';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatRealtime } from './hooks-realtime';
import { chatQueryKeys } from './query-keys';

type Handlers = {
  conversationId?: string | null;
  onFrame: (frame: ChatRealtimeServerFrame) => void;
  onReady?: (frame: Extract<ChatRealtimeServerFrame, { t: 'ready' }>) => void;
  onResync: () => void;
  onStatus?: (status: ChatRealtimeConnectionStatus) => void;
};

const connections = vi.hoisted(
  () =>
    [] as {
      close: ReturnType<typeof vi.fn>;
      handlers: Handlers;
      retry: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    }[]
);

vi.mock('@tuturuuu/internal-api/chat', () => ({
  createWorkspaceChatRealtimeConnection: (
    _wsId: string,
    handlers: Handlers
  ) => {
    const connection = {
      close: vi.fn(),
      handlers,
      retry: vi.fn(),
      send: vi.fn(() => true),
      status: 'connecting',
    };
    connections.push(connection);
    return connection;
  },
}));

const WS = '00000000-0000-4000-8000-0000000000a1';
const SELF = '00000000-0000-4000-8000-000000000001';
const PEER = '00000000-0000-4000-8000-000000000002';
const ROOM = '00000000-0000-4000-8000-0000000000c1';

const inbox = () => connections.find((c) => !c.handlers.conversationId)!;
const room = () => connections.find((c) => c.handlers.conversationId)!;

function directConversation(): ChatConversation {
  return {
    aiEnabled: false,
    archivedAt: null,
    createdAt: '2026-11-20T00:00:00.000Z',
    createdBy: SELF,
    description: null,
    id: ROOM,
    latestMessage: null,
    memberCount: 2,
    members: [{ userId: SELF }, { userId: PEER }] as never,
    metadata: {},
    title: null,
    type: 'direct',
    unreadCount: 0,
    updatedAt: '2026-11-20T00:00:00.000Z',
    wsId: WS,
  };
}

function setup(activeConversationId: string | null = ROOM) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const conversations = [directConversation()];
  const hook = renderHook(
    () => useChatRealtime(WS, { activeConversationId, conversations }),
    { wrapper }
  );
  return { hook, invalidate, queryClient };
}

const invalidatedKeys = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map(
    ([filters]) => (filters as { queryKey: unknown }).queryKey
  );

describe('useChatRealtime', () => {
  beforeEach(() => {
    connections.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens an inbox socket and a socket for the open conversation only', () => {
    const { hook } = setup();
    expect(connections).toHaveLength(2);
    expect(room().handlers.conversationId).toBe(ROOM);
    hook.unmount();
    for (const connection of connections)
      expect(connection.close).toHaveBeenCalled();

    connections.length = 0;
    setup('ai-chat-local');
    expect(connections).toHaveLength(1);
  });

  it('refetches the list and messages for ID-only inbox events', () => {
    const { invalidate } = setup(null);
    act(() =>
      inbox().handlers.onFrame({
        event: {
          conversationId: ROOM,
          message: { id: PEER },
          type: 'message.created',
        } as never,
        seq: 4,
        t: 'event',
      })
    );
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([
        [...chatQueryKeys.all(WS), 'conversations'],
        [...chatQueryKeys.all(WS), 'messages', ROOM],
      ])
    );
  });

  it('patches full message DTOs from the conversation room', () => {
    const { queryClient } = setup();
    const key = [...chatQueryKeys.all(WS), 'messages', ROOM, 50];
    queryClient.setQueryData(key, []);
    const message = {
      attachments: [],
      content: 'hello',
      conversationId: ROOM,
      createdAt: '2026-11-20T00:00:01.000Z',
      id: '00000000-0000-4000-8000-0000000000d1',
      reactions: [],
      senderId: PEER,
    };
    act(() =>
      room().handlers.onFrame({
        event: { conversationId: ROOM, message, type: 'message.created' },
        seq: 1,
        t: 'event',
      } as never)
    );
    expect(queryClient.getQueryData(key)).toEqual([message]);
  });

  it('shows typing from others and online peers of direct conversations', () => {
    const { hook } = setup();
    act(() => {
      inbox().handlers.onReady?.({
        expiresAt: 0,
        online: [SELF],
        room: 'inbox',
        t: 'ready',
        userId: SELF,
      });
      room().handlers.onReady?.({
        expiresAt: 0,
        room: 'conversation',
        t: 'ready',
        userId: SELF,
      });
    });
    expect(hook.result.current.onlineConversationIds.has(ROOM)).toBe(false);
    act(() =>
      inbox().handlers.onFrame({ on: true, t: 'online', userId: PEER })
    );
    expect(hook.result.current.onlineConversationIds.has(ROOM)).toBe(true);

    act(() => room().handlers.onFrame({ on: true, t: 'typing', userId: SELF }));
    expect(hook.result.current.typingConversationIds.has(ROOM)).toBe(false);
    act(() => room().handlers.onFrame({ on: true, t: 'typing', userId: PEER }));
    expect(hook.result.current.typingConversationIds.has(ROOM)).toBe(true);
  });

  it('polls while sockets are exhausted and retries on foreground', () => {
    vi.useFakeTimers();
    const { invalidate } = setup();
    act(() => room().handlers.onStatus?.('polling'));
    invalidate.mockClear();
    act(() => vi.advanceTimersByTime(15_000));
    expect(invalidatedKeys(invalidate)).toContainEqual([
      ...chatQueryKeys.all(WS),
      'messages',
      ROOM,
    ]);
    act(() => window.dispatchEvent(new Event('online')));
    expect(room().retry).toHaveBeenCalled();
    expect(inbox().retry).toHaveBeenCalled();
  });

  it('uses the local stream when the Worker is not configured', () => {
    const sources: { close: ReturnType<typeof vi.fn>; url: string }[] = [];
    vi.stubGlobal(
      'EventSource',
      class {
        close = vi.fn();
        onerror = null;
        onmessage = null;
        onopen = null;
        constructor(readonly url: string) {
          sources.push(this);
        }
      }
    );
    const { hook } = setup(null);
    act(() => inbox().handlers.onStatus?.('disabled'));
    expect(sources.map((source) => source.url)).toEqual([
      `/api/v1/workspaces/${WS}/chat/realtime`,
    ]);
    hook.unmount();
    expect(sources[0]?.close).toHaveBeenCalled();
  });
});
