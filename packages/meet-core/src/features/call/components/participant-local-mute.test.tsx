// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { type CallLayout, CallStage } from './call-stage';
import { ParticipantTile } from './participant-tile';
import {
  PlaybackVolumeControl,
  PlaybackVolumeProvider,
} from './playback-volume';

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
it('refreshes Mira badges when only Live presence or assistant preferences change', () => {
  const participant = {
    userId: 'peer',
    displayName: 'Peer',
    media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
  } as MeetRealtimePresence;
  const view = (
    miraActive: boolean,
    audio?: MeetRealtimePresence['assistantAudio']
  ) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        resumePlaybackLabel="Play"
        miraActive={miraActive}
        participant={{ ...participant, assistantAudio: audio }}
      />
    </NextIntlClientProvider>
  );
  const label = new RegExp(messages.meet.live.title);
  const { rerender } = render(view(false));
  expect(screen.queryByRole('img', { name: label })).toBeNull();
  rerender(view(true));
  expect(
    screen.getByRole('img', { name: label }).getAttribute('aria-label')
  ).toContain(messages.meet.live.mic_excluded);
  rerender(view(true, { microphoneEnabled: true, speakerEnabled: true }));
  const status = screen
    .getByRole('img', { name: label })
    .getAttribute('aria-label');
  expect(status).toContain(messages.meet.live.mic_included);
  expect(status).toContain(messages.meet.live.hearing_mira);
  rerender(view(false));
  expect(screen.queryByRole('img', { name: label })).toBeNull();
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
        <CallStage
          room={room}
          layout={layout}
          focus={null}
          onFocus={vi.fn()}
          onChat={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view('grid'));
    const audioFor = (_label: string) =>
      screen.getByTestId(`participant-peer-${kind}`).querySelector('audio')!;
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

it('supports local mute in direct tile consumers without a stage handler', () => {
  class Stream {
    getAudioTracks() {
      return [{ kind: 'audio' }];
    }
    getVideoTracks() {
      return [];
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={
          {
            userId: 'peer',
            displayName: 'Peer',
            media: { audioEnabled: true },
          } as MeetRealtimePresence
        }
        stream={new Stream() as unknown as MediaStream}
        resumePlaybackLabel="Play"
      />
    </NextIntlClientProvider>
  );
  const audio = screen
    .getByTestId('participant-peer-camera')
    .querySelector('audio')!;
  fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
  expect(audio.muted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Unmute Peer for me' }));
  expect(audio.muted).toBe(false);
});

it('applies master and participant gains to playback without muting the source track', () => {
  const track = { kind: 'audio', enabled: true };
  class Stream {
    getAudioTracks() {
      return [track];
    }
    getVideoTracks() {
      return [];
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  const participant = {
    userId: 'peer',
    displayName: 'Peer',
    media: { audioEnabled: true },
  } as MeetRealtimePresence;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlaybackVolumeProvider>
        <PlaybackVolumeControl participants={[participant]} selfUserId="self" />
        <ParticipantTile
          participant={participant}
          stream={new Stream() as unknown as MediaStream}
          resumePlaybackLabel="Play"
        />
      </PlaybackVolumeProvider>
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Playback volume' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Master volume' }), {
    target: { value: '50' },
  });
  fireEvent.change(screen.getByRole('slider', { name: 'Peer volume' }), {
    target: { value: '40' },
  });
  expect(
    screen.getByTestId('participant-peer-camera').querySelector('audio')!.volume
  ).toBe(0.2);
  expect(track.enabled).toBe(true);
});
