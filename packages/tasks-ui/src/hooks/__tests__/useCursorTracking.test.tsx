/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVATE_TASK_REALTIME_CHANNEL_CONFIG } from '../useBoardRealtime.types';
import { useCursorTracking } from '../useCursorTracking';

type BroadcastListener = (message: {
  payload: Record<string, unknown>;
}) => void;

type MockSupabaseClient = {
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

vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: false,
}));

function createContainerRef(): RefObject<HTMLDivElement | null> {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
    }) as DOMRect;
  document.body.append(element);
  return { current: element };
}

describe('useCursorTracking', () => {
  let broadcastListeners: Map<string, BroadcastListener>;
  let mockChannel: {
    on: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let mockRemoveChannel: ReturnType<typeof vi.fn>;
  let requestAnimationFrameMock: ReturnType<typeof vi.fn>;
  let animationFrameCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    broadcastListeners = new Map();
    animationFrameCallbacks = [];

    requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    mockChannel = {
      on: vi.fn(
        (
          type: string,
          config: { event?: string },
          callback: BroadcastListener
        ) => {
          if (type === 'broadcast' && config.event) {
            broadcastListeners.set(config.event, callback);
          }
          return mockChannel;
        }
      ),
      send: vi.fn(),
      subscribe: vi.fn(() => mockChannel),
    };
    mockRemoveChannel = vi.fn();

    const mockCreateClient = createClient as unknown as MockCreateClientFn;
    mockCreateClient.mockReturnValue({
      channel: vi.fn(() => mockChannel),
      removeChannel: mockRemoveChannel,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('subscribes to cursor channels with private realtime authorization', () => {
    const containerRef = createContainerRef();

    renderHook(() =>
      useCursorTracking('board-realtime-board-1', containerRef, {
        display_name: 'Current User',
        id: 'user-current',
      })
    );

    const supabaseInstance = (createClient as unknown as MockCreateClientFn)();
    expect(supabaseInstance.channel).toHaveBeenCalledWith(
      'board-realtime-board-1',
      PRIVATE_TASK_REALTIME_CHANNEL_CONFIG
    );
  });

  it('broadcasts cursor payloads without private profile fields', async () => {
    const containerRef = createContainerRef();

    renderHook(() =>
      useCursorTracking(
        'board-realtime-board-1',
        containerRef,
        {
          avatar_url: 'https://example.com/avatar.png',
          display_name: 'Current User',
          email: 'current@example.com',
          id: 'user-current',
        },
        { cursorScope: { boardId: 'board-1', type: 'board' } }
      )
    );

    act(() => {
      containerRef.current?.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 80, clientY: 40 })
      );
      animationFrameCallbacks.shift()?.(0);
    });

    await waitFor(() => expect(mockChannel.send).toHaveBeenCalled());
    expect(mockChannel.send).toHaveBeenCalledWith({
      event: 'cursor-move',
      payload: {
        metadata: { cursorScope: { boardId: 'board-1', type: 'board' } },
        user: {
          avatar_url: 'https://example.com/avatar.png',
          display_name: 'Current User',
          id: 'user-current',
        },
        x: expect.any(Number),
        y: expect.any(Number),
      },
      type: 'broadcast',
    });
  });

  it('accepts only well-formed cursor payloads and strips private fields', () => {
    const containerRef = createContainerRef();
    const { result } = renderHook(() =>
      useCursorTracking('board-realtime-board-1', containerRef, {
        display_name: 'Current User',
        id: 'user-current',
      })
    );

    const listener = broadcastListeners.get('cursor-move');
    expect(listener).toBeDefined();

    act(() => {
      listener?.({
        payload: {
          user: { email: 'bad@example.com' },
          x: 12,
          y: 18,
        },
      });
    });
    expect(result.current.cursors.size).toBe(0);

    act(() => {
      listener?.({
        payload: {
          metadata: { cursorScope: { boardId: 'board-1', type: 'board' } },
          user: {
            avatar_url: 'https://example.com/other.png',
            display_name: 'Other User',
            email: 'other@example.com',
            id: 'user-other',
          },
          x: 12,
          y: 18,
        },
      });
    });

    expect(result.current.cursors.get('user-other')).toEqual({
      lastUpdatedAt: expect.any(Number),
      metadata: { cursorScope: { boardId: 'board-1', type: 'board' } },
      user: {
        avatar_url: 'https://example.com/other.png',
        display_name: 'Other User',
        id: 'user-other',
      },
      x: 12,
      y: 18,
    });
  });
});
