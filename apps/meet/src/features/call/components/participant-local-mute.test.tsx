// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { type CallLayout, CallStage } from './call-stage';

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
    vi.stubGlobal('MediaStream', Stream);
    const participant = {
      userId: 'peer',
      displayName: 'Peer',
      media: { audioEnabled: true, videoEnabled: false, screenEnabled: true },
    } as MeetRealtimePresence;
    const room = {
      state: {
        participants: { peer: participant },
        selfUserId: 'self',
        stage: { raisedHandUserIds: [] },
      },
      remoteMedia: {
        peer: kind === 'screen' ? { screen_audio: track } : { audio: track },
      },
      localStream: null,
      screenStream: null,
    } as unknown as MeetRoomController;
    const view = (layout: CallLayout) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallStage room={room} layout={layout} focus={null} onFocus={vi.fn()} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view('grid'));
    const audioFor = (label: string) =>
      screen
        .getByRole('button', { name: label })
        .closest('.group')!
        .querySelector('audio')!;
    const audio = audioFor('Mute Peer for me');
    expect(audio.muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
    expect(audio.muted).toBe(true);
    expect(track.enabled).toBe(true);
    rerender(view('spotlight'));
    expect(audioFor('Unmute Peer for me').muted).toBe(true);
    rerender(view('sidebar'));
    expect(audioFor('Unmute Peer for me').muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Peer for me' }));
    expect(audioFor('Mute Peer for me').muted).toBe(false);
  }
);
