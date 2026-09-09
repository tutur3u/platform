// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { ParticipantTile } from './participant-tile';

let frames: Map<number, VideoFrameRequestCallback>;
let nextFrame: number;
const participant = {
  userId: 'peer',
  displayName: 'Peer',
  media: { audioEnabled: true, videoEnabled: true, screenEnabled: false },
} as MeetRealtimePresence;
function makeStream() {
  const track = Object.assign(new EventTarget(), {
    id: crypto.randomUUID(),
    kind: 'video',
    readyState: 'live',
    muted: true,
    enabled: true,
  });
  return new MediaStream([track as unknown as MediaStreamTrack]);
}
function tile(stream: MediaStream, cameraEnabled = true) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={{
          ...participant,
          media: { ...participant.media, videoEnabled: cameraEnabled },
        }}
        stream={stream}
        resumePlaybackLabel="Play audio"
        onRetry={() => undefined}
      />
    </NextIntlClientProvider>
  );
}
function presentFrame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending)
      callback(performance.now(), {} as VideoFrameCallbackMetadata);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(private tracks: MediaStreamTrack[]) {}
      getTracks() {
        return this.tracks;
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === 'video');
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  Object.defineProperty(
    HTMLVideoElement.prototype,
    'requestVideoFrameCallback',
    {
      configurable: true,
      value: (callback: VideoFrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
    }
  );
  Object.defineProperty(
    HTMLVideoElement.prototype,
    'cancelVideoFrameCallback',
    { configurable: true, value: (id: number) => frames.delete(id) }
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(
    HTMLVideoElement.prototype,
    'requestVideoFrameCallback'
  );
  Reflect.deleteProperty(
    HTMLVideoElement.prototype,
    'cancelVideoFrameCallback'
  );
});
it('removes the avatar and reconnect action when a muted receiver presents video frames', () => {
  const { container } = render(tile(makeStream()));
  expect(screen.getByText('P')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Reconnect incoming video' })
  ).toBeTruthy();
  presentFrame();
  expect(screen.queryByText('P')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Reconnect incoming video' })
  ).toBeNull();
  expect(container.querySelector('video')?.className).not.toContain(
    'opacity-0'
  );
  expect(screen.getByRole('img', { name: 'Receiving video' })).toBeTruthy();
});
it('does not reuse presentation evidence for a replacement stream or a disabled camera', () => {
  const { rerender, container } = render(tile(makeStream()));
  presentFrame();
  const replacement = makeStream();
  rerender(tile(replacement));
  expect(screen.getByText('P')).toBeTruthy();
  presentFrame();
  expect(screen.queryByText('P')).toBeNull();
  rerender(tile(replacement, false));
  expect(screen.getByText('P')).toBeTruthy();
  expect(container.querySelector('video')?.className).toContain('opacity-0');
});
it('restores recovery for stalled muted video and clears it when frames resume', () => {
  render(tile(makeStream()));
  presentFrame();
  act(() => vi.advanceTimersByTime(4000));
  expect(
    screen.getByRole('button', { name: 'Reconnect incoming video' })
  ).toBeTruthy();
  presentFrame();
  expect(screen.queryByText('P')).toBeNull();
});
it('cancels frame observation on unmount', () => {
  const { unmount } = render(tile(makeStream()));
  expect(frames.size).toBe(1);
  unmount();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
