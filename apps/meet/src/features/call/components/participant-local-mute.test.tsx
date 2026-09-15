// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { ParticipantTile } from './participant-tile';

vi.mock('./media-receiving-status', () => ({
  useStreamReadiness: () => ({}),
  MediaReceivingStatus: () => null,
}));
vi.mock('../lib/media-playback', () => ({
  attachMediaPlayback: () => undefined,
}));
vi.mock('../lib/video-presentation', () => ({
  observeVideoPresentation: () => undefined,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(['camera', 'screen'] as const)(
  'silences only the local %s playback and can restore it',
  (kind) => {
    const track = { kind: 'audio', enabled: true };
    class Stream {
      constructor(private tracks: (typeof track)[]) {}
      getAudioTracks() {
        return this.tracks;
      }
      getVideoTracks() {
        return [];
      }
    }
    vi.stubGlobal('MediaStream', Stream);
    const participant = {
      userId: 'peer',
      displayName: 'Peer',
      media: { audioEnabled: true, videoEnabled: false, screenEnabled: true },
    } as MeetRealtimePresence;
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ParticipantTile
          participant={participant}
          kind={kind}
          stream={new Stream([track]) as unknown as MediaStream}
          resumePlaybackLabel="Play"
        />
      </NextIntlClientProvider>
    );
    const audio = container.querySelector('audio')!;
    expect(audio.muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
    expect(audio.muted).toBe(true);
    expect(track.enabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Peer for me' }));
    expect(audio.muted).toBe(false);
  }
);
