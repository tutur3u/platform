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
import { STAGE_JOIN_QR_ANCHOR } from './stage-join-qr';

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

it('centres the resume-audio action clear of the join QR chip', () => {
  const track = {
    kind: 'audio',
    addEventListener() {},
    removeEventListener() {},
    stop() {},
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        resumePlaybackLabel="Play meeting audio"
        stream={new FakeStream([track]) as unknown as MediaStream}
      />
    </NextIntlClientProvider>
  );
  const resume = view.getByRole('button', { name: 'Play meeting audio' });
  const position = resume.className.split(/\s+/);
  expect(position).toEqual(
    expect.arrayContaining(['top-1/2', 'left-1/2', '-translate-x-1/2'])
  );
  // The chip's anchor is a bottom-left offset; the action shares none of it.
  for (const anchor of STAGE_JOIN_QR_ANCHOR.split(/\s+/))
    expect(position).not.toContain(anchor);
});

it('keeps the resume-audio name when a narrow tile shows only its icon', () => {
  const track = {
    kind: 'audio',
    addEventListener() {},
    removeEventListener() {},
    stop() {},
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        resumePlaybackLabel="Play meeting audio"
        stream={new FakeStream([track]) as unknown as MediaStream}
      />
    </NextIntlClientProvider>
  );
  const resume = view.getByRole('button', { name: 'Play meeting audio' });
  // It never grows past the tile, and the label truncates rather than clips.
  expect(resume.className).toContain('max-w-[calc(100%-1rem)]');
  const label = view.getByText('Play meeting audio');
  expect(label.className).toContain('truncate');
  // Below a 12rem tile the label is read but not shown: icon only.
  expect(label.className).toContain('@max-[12rem]:sr-only');
  expect(resume.className).toContain('@max-[12rem]:size-9');
  expect(resume.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
    'true'
  );
});
