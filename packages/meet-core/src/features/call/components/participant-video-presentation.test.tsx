// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
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
it('removes the avatar when a muted receiver presents video frames', () => {
  const { container } = render(tile(makeStream()));
  expect(screen.getByText('P')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /reconnect|retry/i })).toBeNull();
  presentFrame();
  expect(screen.queryByText('P')).toBeNull();
  expect(screen.queryByRole('button', { name: /reconnect|retry/i })).toBeNull();
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
it('keeps the avatar for stalled muted video, with no manual action, and clears it when frames resume', () => {
  render(tile(makeStream()));
  presentFrame();
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.queryByRole('button', { name: /reconnect|retry/i })).toBeNull();
  presentFrame();
  expect(screen.queryByText('P')).toBeNull();
});
it('cancels frame observation on unmount', () => {
  const { unmount } = render(tile(makeStream()));
  expect(frames.size).toBe(1);
  // jsdom queues the media element volumechange event with setImmediate.
  act(() => vi.advanceTimersByTime(0));
  unmount();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('supports browsers without frame callbacks', () => {
  Reflect.deleteProperty(
    HTMLVideoElement.prototype,
    'requestVideoFrameCallback'
  );
  const { container } = render(tile(makeStream()));
  const video = container.querySelector('video')!;
  Object.defineProperties(video, {
    paused: { value: false },
    readyState: { value: 2 },
    videoWidth: { value: 640 },
  });
  act(() => video.dispatchEvent(new Event('timeupdate')));
  expect(screen.queryByText('P')).toBeNull();
});
it('clears stale evidence across camera off and on', () => {
  const stream = makeStream();
  const { rerender } = render(tile(stream));
  presentFrame();
  rerender(tile(stream, false));
  rerender(tile(stream, true));
  expect(screen.getByText('P')).toBeTruthy();
  presentFrame();
  expect(screen.queryByText('P')).toBeNull();
});
it('expires camera presentation even if the receiver stays unmuted', () => {
  const stream = makeStream();
  Object.defineProperty(stream.getVideoTracks()[0], 'muted', { value: false });
  render(tile(stream));
  presentFrame();
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.queryByRole('button', { name: /reconnect|retry/i })).toBeNull();
});
it('retains a presented static screen without inventing a camera stall', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={{
          ...participant,
          media: { ...participant.media, screenEnabled: true },
        }}
        kind="screen"
        stream={makeStream()}
        resumePlaybackLabel="Play audio"
      />
    </NextIntlClientProvider>
  );
  presentFrame();
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.queryByText('P')).toBeNull();
  expect(screen.queryByRole('button', { name: /reconnect|retry/i })).toBeNull();
});
