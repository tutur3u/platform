// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

vi.mock('../lib/media-playback', () => ({
  // The browser blocks the audio element on attach.
  attachMediaPlayback: (
    _element: unknown,
    _stream: unknown,
    onBlocked?: (blocked: boolean) => void
  ) => {
    onBlocked?.(true);
    return () => undefined;
  },
}));

import { ParticipantTile } from './participant-tile';

afterEach(cleanup);

class FakeStream {
  constructor(private readonly tracks: unknown[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return [];
  }
}
(globalThis as { MediaStream?: unknown }).MediaStream = FakeStream;
const play = vi.fn(() => Promise.resolve());
HTMLMediaElement.prototype.play = play;
HTMLMediaElement.prototype.pause = () => {};

const participant = {
  userId: 'peer',
  displayName: 'Peer',
  media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
} as MeetRealtimePresence;

function show(
  onPlaybackBlocked: (key: string, retry: (() => void) | null) => void
) {
  const track = {
    kind: 'audio',
    addEventListener() {},
    removeEventListener() {},
    stop() {},
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        condensed
        onPlaybackBlocked={onPlaybackBlocked}
        participant={participant}
        resumePlaybackLabel="Play meeting audio"
        stream={new FakeStream([track]) as unknown as MediaStream}
      />
    </NextIntlClientProvider>
  );
}

it('reports blocked audio with a retry that plays the tile audio, then clears', async () => {
  const report = vi.fn();
  const { unmount } = show(report);
  const registered = report.mock.calls.find(([, retry]) => retry);
  expect(registered).toBeTruthy();
  const [key, retry] = registered as [string, () => void];
  expect(key).toBe('peer:camera');
  await act(async () => {
    retry();
  });
  expect(play).toHaveBeenCalled();
  // Playing clears the block; the registration is withdrawn.
  expect(report).toHaveBeenLastCalledWith('peer:camera', null);
  unmount();
});

it('reports nothing when no phone stage is listening', () => {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        resumePlaybackLabel="Play meeting audio"
        stream={new FakeStream([]) as unknown as MediaStream}
      />
    </NextIntlClientProvider>
  );
  expect(view.container).toBeTruthy();
});
