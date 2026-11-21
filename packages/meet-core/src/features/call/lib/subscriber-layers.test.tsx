// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RemoteTrackOwner } from './remote-playback';
import type { StageVideoWindow } from './room-actions';
import type { MeetSignaling } from './signaling';
import { type RequestedLayer, useSubscriberLayers } from './subscriber-layers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(
  capabilities: string[] = ['ascii-simulcast', 'layer-update'],
  reply: (message: { tracks: Array<{ mid: string }> }) => unknown = (
    message
  ) => ({ tracks: message.tracks.map(({ mid }) => ({ mid })) }),
  extra: Partial<Parameters<typeof useSubscriberLayers>[0]> = {}
) {
  const pc = {
    connectionState: 'connected',
    getStats: vi.fn(async () => new Map()),
  } as unknown as RTCPeerConnection;
  const request = vi.fn(async (message: { tracks: Array<{ mid: string }> }) =>
    reply(message)
  );
  const resetSubscriber = vi.fn();
  const refs = {
    queue: { current: Promise.resolve() },
    peer: { current: pc as RTCPeerConnection | null },
    sessionRef: { current: 'receiver' as string | null },
    owners: {
      current: new Map<string, RemoteTrackOwner>([
        ['4', { userId: 'a', kind: 'video', subscriptionKey: 'pub:a-video' }],
      ]),
    },
    state: {
      current: {
        mediaCapabilities: capabilities,
        remoteTracks: {
          'pub:a-video': {
            sessionId: 'pub',
            trackName: 'a-video',
            userId: 'a',
            cameraRids: ['f', 'h', 'q'] as Array<'f' | 'h' | 'q'>,
          },
        },
      },
    },
    requestedLayers: {
      current: new Map<string, RequestedLayer>([
        ['pub:a-video', { layer: 'high', peer: pc }],
      ]),
    },
    stageWindow: {
      current: {
        cameraUserIds: ['a'],
        changedAt: 0,
        tileHeights: new Map([['a', 120]]),
      } as StageVideoWindow | null,
    },
    signalingRef: {
      current: { request } as unknown as MeetSignaling | null,
    },
  };
  renderHook(() =>
    useSubscriberLayers({ active: true, resetSubscriber, ...refs, ...extra })
  );
  return { pc, request, refs, resetSubscriber };
}

it('downgrades a thumbnail through the subscriber queue and records the confirmed layer', async () => {
  const { request, refs } = setup();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(request).toHaveBeenCalledWith({
    type: 'sfu.tracks.update',
    sessionId: 'receiver',
    tracks: [
      {
        location: 'remote',
        mid: '4',
        sessionId: 'pub',
        trackName: 'a-video',
        simulcast: {
          preferredRid: 'q',
          priorityOrdering: 'asciibetical',
          ridNotAvailable: 'asciibetical',
        },
      },
    ],
  });
  expect(refs.requestedLayers.current.get('pub:a-video')?.layer).toBe('low');
});

it('waits for an in-flight subscription before sending a layer change', async () => {
  const { request, refs } = setup();
  let release!: () => void;
  refs.queue.current = new Promise<void>((resolve) => {
    release = resolve;
  });
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(request).not.toHaveBeenCalled();
  // The subscription replaced the receiver session before finishing.
  refs.sessionRef.current = 'replacement';
  await act(async () => release());
  expect(request).not.toHaveBeenCalled();
});

it('drops planned changes when the receiver closes during sampling', async () => {
  const { request, refs } = setup();
  refs.owners.current.clear();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(request).not.toHaveBeenCalled();
});

it('sends nothing to a room server without layer updates', async () => {
  const { pc, request } = setup(['ascii-simulcast']);
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(request).not.toHaveBeenCalled();
  expect(pc.getStats).not.toHaveBeenCalled();
});

it('caches nothing when the reply omits per-track results', async () => {
  const { request, refs } = setup(undefined, () => ({}));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(request).toHaveBeenCalledTimes(1);
  expect(refs.requestedLayers.current.get('pub:a-video')?.layer).toBe('high');
});

it('rebuilds the receiver if a layer update demands renegotiation', async () => {
  const { resetSubscriber, request } = setup(undefined, () => ({
    requiresImmediateRenegotiation: true,
    tracks: [{ mid: '4' }],
  }));
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(resetSubscriber).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
});

it('keeps a paused camera state across a receiver rebuild and probes later', async () => {
  const { refs, request } = setup();
  const policy = (await import('./media-policy')).createMediaPolicy(null);
  policy.setAudioOnly(true);
  refs.owners.current.clear();
  const { unmount } = renderHook(() =>
    useSubscriberLayers({
      active: true,
      resetSubscriber: vi.fn(),
      policy,
      ...refs,
    })
  );
  refs.peer.current = {
    connectionState: 'connected',
    getStats: vi.fn(async () => new Map()),
  } as unknown as RTCPeerConnection;
  await act(() => vi.advanceTimersByTimeAsync(28_000));
  expect(policy.getSnapshot().audioOnly).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(policy.getSnapshot().audioOnly).toBe(false);
  expect(request).not.toHaveBeenCalled();
  unmount();
});

it('ends an audio-only pause even when no receiver exists', async () => {
  const { refs } = setup();
  const policy = (await import('./media-policy')).createMediaPolicy(null);
  policy.setAudioOnly(true);
  refs.peer.current = null;
  refs.sessionRef.current = null;
  refs.owners.current.clear();
  const { unmount } = renderHook(() =>
    useSubscriberLayers({
      active: true,
      resetSubscriber: vi.fn(),
      policy,
      ...refs,
    })
  );
  await act(() => vi.advanceTimersByTimeAsync(32_000));
  expect(policy.getSnapshot().audioOnly).toBe(false);
  expect(policy.quality.take(policy.getSnapshot()).recvVideoKbps).toBeNull();
  unmount();
});

it('keeps a rebuilt receiver at the link ceiling until it earns an upgrade', async () => {
  const ceilingRef = { current: 'low' as 'high' | 'mid' | 'low' };
  const { refs, request } = setup(undefined, undefined, { ceilingRef });
  refs.stageWindow.current = {
    cameraUserIds: ['a'],
    spotlightUserId: 'a',
    changedAt: 0,
    tileHeights: new Map([['a', 720]]),
  };
  refs.requestedLayers.current.set('pub:a-video', {
    layer: 'low',
    peer: refs.peer.current!,
  });
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(request).not.toHaveBeenCalled();
  expect(ceilingRef.current).toBe('low');
});
