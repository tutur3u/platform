/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { createClient } from '@tuturuuu/supabase/next/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardPresence } from '../useBoardPresence';

type PresenceListener = () => void;

type MockChannel = {
  on: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
};

type MockSupabaseClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
};

type MockCreateClientFn = {
  (): MockSupabaseClient;
  mockReturnValue: (value: MockSupabaseClient) => void;
};

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: false,
}));

describe('useBoardPresence', () => {
  let mockChannel: MockChannel;
  let mockClient: MockSupabaseClient;
  let presenceListeners: Map<string, PresenceListener>;

  beforeEach(() => {
    presenceListeners = new Map();

    mockChannel = {
      on: vi.fn(
        (
          type: string,
          config: { event?: string },
          callback: PresenceListener
        ) => {
          if (type === 'presence' && config.event) {
            presenceListeners.set(config.event, callback);
          }
          return mockChannel;
        }
      ),
      presenceState: vi.fn(() => ({})),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        callback?.('SUBSCRIBED');
        return mockChannel;
      }),
      track: vi.fn(() => Promise.resolve('ok')),
      untrack: vi.fn(() => Promise.resolve('ok')),
    };

    mockClient = {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: {
              user: {
                email: 'ada.auth@example.com',
                id: 'user-1',
              },
            },
          })
        ),
      },
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(() => Promise.resolve()),
    };

    (createClient as unknown as MockCreateClientFn).mockReturnValue(mockClient);
    vi.mocked(getCurrentUserProfile).mockResolvedValue({
      avatar_url: 'https://example.com/ada.png',
      created_at: '2026-01-01T00:00:00.000Z',
      default_workspace_id: 'user-1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      full_name: 'Ada Lovelace',
      id: 'user-1',
      new_email: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tracks sanitized profile data on a private board realtime presence channel', async () => {
    const { result } = renderHook(() => useBoardPresence('board-1'));

    await act(async () => {
      await (result.current.updateLocation(
        { boardId: 'board-1', type: 'board' },
        { listStatusFilter: 'active' }
      ) as unknown as Promise<void>);
    });

    expect(mockClient.channel).toHaveBeenCalledWith('board-realtime-board-1', {
      config: {
        presence: {
          enabled: true,
          key: 'user-1',
        },
        private: true,
      },
    });
    expect(mockChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        away: false,
        location: { boardId: 'board-1', type: 'board' },
        metadata: { listStatusFilter: 'active' },
        session_id: expect.any(String),
        user: {
          avatar_url: 'https://example.com/ada.png',
          display_name: 'Ada Lovelace',
          email: 'ada@example.com',
          id: 'user-1',
        },
      })
    );
  });

  it('does not create a channel while disabled', async () => {
    const { result } = renderHook(() =>
      useBoardPresence('board-1', { enabled: false })
    );

    await act(async () => {
      await (result.current.updateLocation({
        boardId: 'board-1',
        type: 'board',
      }) as unknown as Promise<void>);
    });

    expect(mockClient.channel).not.toHaveBeenCalled();
    expect(mockChannel.track).not.toHaveBeenCalled();
  });

  it('exposes board viewers from presence sync events', async () => {
    const viewerPresence = {
      location: { boardId: 'board-1', type: 'board' as const },
      online_at: '2026-01-01T00:00:00.000Z',
      session_id: 'session-2',
      user: {
        avatar_url: null,
        display_name: 'Guest Reviewer',
        email: 'guest@example.com',
        id: 'user-2',
      },
    };
    mockChannel.presenceState.mockReturnValue({
      'user-2': [viewerPresence],
    });
    const { result } = renderHook(() => useBoardPresence('board-1'));

    await act(async () => {
      await (result.current.updateLocation({
        boardId: 'board-1',
        type: 'board',
      }) as unknown as Promise<void>);
    });

    act(() => {
      presenceListeners.get('sync')?.();
    });

    expect(result.current.getBoardViewers('board-1')).toEqual([viewerPresence]);
  });
});
