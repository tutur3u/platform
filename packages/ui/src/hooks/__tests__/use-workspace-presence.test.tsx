/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type UseWorkspacePresenceResult,
  useWorkspacePresence,
  type WorkspacePresenceState,
} from '../use-workspace-presence';

const { createClientMock, getCurrentUserProfileMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getCurrentUserProfileMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: getCurrentUserProfileMock,
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: false,
}));

type PresenceEvent = 'sync' | 'join' | 'leave';
type PresenceListener = () => void;
type SubscribeCallback = (status: string) => void;

function createPresence({
  boardId = 'board-1',
  onlineAt,
  sessionId,
  userId,
}: {
  boardId?: string;
  onlineAt: string;
  sessionId: string;
  userId: string;
}): WorkspacePresenceState & { presence_ref: string } {
  return {
    user: {
      avatar_url: null,
      display_name: `User ${userId}`,
      email: `${userId}@example.com`,
      id: userId,
    },
    online_at: onlineAt,
    session_id: sessionId,
    location: {
      boardId,
      type: 'board',
    },
    presence_ref: `${userId}:${sessionId}`,
  };
}

describe('useWorkspacePresence', () => {
  let currentPresenceState: RealtimePresenceState<WorkspacePresenceState>;
  let listeners: Map<PresenceEvent, PresenceListener>;
  let subscribeCallback: SubscribeCallback | undefined;
  let mockChannel: {
    on: ReturnType<typeof vi.fn>;
    presenceState: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
  };
  let mockRemoveChannel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    currentPresenceState = {};
    listeners = new Map();
    subscribeCallback = undefined;
    mockRemoveChannel = vi.fn();
    mockChannel = {
      on: vi.fn(
        (
          _type: 'presence',
          config: { event: PresenceEvent },
          callback: PresenceListener
        ) => {
          listeners.set(config.event, callback);
          return mockChannel;
        }
      ),
      presenceState: vi.fn(() => currentPresenceState),
      subscribe: vi.fn((callback: SubscribeCallback) => {
        subscribeCallback = callback;
        return mockChannel;
      }),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
    };

    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'current-user',
            },
          },
        }),
      },
      channel: vi.fn(() => mockChannel),
      removeChannel: mockRemoveChannel,
    });

    getCurrentUserProfileMock.mockResolvedValue({
      avatar_url: null,
      display_name: 'Current User',
      email: 'current-user@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function connectToBoard(result: {
    current: UseWorkspacePresenceResult;
  }) {
    let updatePromise!: Promise<void>;

    act(() => {
      updatePromise = result.current.updateLocation({
        boardId: 'board-1',
        type: 'board',
      }) as unknown as Promise<void>;
    });

    await waitFor(() => {
      expect(subscribeCallback).toBeDefined();
    });

    await act(async () => {
      subscribeCallback?.('SUBSCRIBED');
      await updatePromise;
    });
  }

  it('counts multiple sessions from the same board user once for cursor limits', async () => {
    const { result } = renderHook(() =>
      useWorkspacePresence({
        maxPresencePerBoard: 1,
        wsId: 'ws-1',
      })
    );

    await connectToBoard(result);

    currentPresenceState = {
      'user-1': [
        createPresence({
          onlineAt: '2026-05-17T01:00:00.000Z',
          sessionId: 'tab-1',
          userId: 'user-1',
        }),
        createPresence({
          onlineAt: '2026-05-17T01:01:00.000Z',
          sessionId: 'tab-2',
          userId: 'user-1',
        }),
      ],
    };

    await act(async () => {
      listeners.get('sync')?.();
    });

    expect(result.current.getBoardViewers('board-1')).toHaveLength(2);
    expect(result.current.getBoardPresenceCount('board-1')).toBe(1);
    expect(result.current.isBoardOverLimit('board-1')).toBe(false);
  });

  it('marks the board over limit when distinct users exceed the cursor cap', async () => {
    const { result } = renderHook(() =>
      useWorkspacePresence({
        maxPresencePerBoard: 1,
        wsId: 'ws-1',
      })
    );

    await connectToBoard(result);

    currentPresenceState = {
      'user-1': [
        createPresence({
          onlineAt: '2026-05-17T01:00:00.000Z',
          sessionId: 'tab-1',
          userId: 'user-1',
        }),
      ],
      'user-2': [
        createPresence({
          onlineAt: '2026-05-17T01:01:00.000Z',
          sessionId: 'tab-1',
          userId: 'user-2',
        }),
      ],
    };

    await act(async () => {
      listeners.get('sync')?.();
    });

    expect(result.current.getBoardPresenceCount('board-1')).toBe(2);
    expect(result.current.isBoardOverLimit('board-1')).toBe(true);
  });
});
