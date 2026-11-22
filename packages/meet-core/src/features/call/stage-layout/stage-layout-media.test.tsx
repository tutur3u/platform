// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { type CallLayout, CallStage } from '../components/call-stage';
import type { MeetRoomController } from '../lib/room-controller';
import { StageLayoutView } from './stage-layout-view';
import { useStageLayout } from './use-stage-layout';

vi.mock('../components/media-receiving-status', () => ({
  useStreamReadiness: () => ({}),
  MediaReceivingStatus: () => null,
}));
vi.mock('../lib/media-playback', () => ({
  attachMediaPlayback: () => undefined,
}));
vi.mock('../lib/video-presentation', () => ({
  observeVideoPresentation: () => undefined,
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function room() {
  const track = { kind: 'audio', enabled: true };
  class Stream {
    constructor(private tracks = [track]) {}
    getTracks() {
      return this.tracks;
    }
    getAudioTracks() {
      return this.tracks.filter((t) => t.kind === 'audio');
    }
    getVideoTracks() {
      return this.tracks.filter((t) => t.kind === 'video');
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  const participant = {
    userId: 'peer',
    displayName: 'Peer',
    media: { audioEnabled: true, videoEnabled: true, screenEnabled: false },
  } as MeetRealtimePresence;
  return {
    state: {
      participants: { peer: participant },
      selfUserId: 'self',
      settings: { transport: 'media' },
      stage: { raisedHandUserIds: [] },
    },
    remoteMedia: { peer: { audio: track } },
    localStream: null,
    screenStream: null,
  } as unknown as MeetRoomController;
}

let controller: ReturnType<typeof useStageLayout>;
function Harness({
  media,
  layout,
  focus = null,
}: {
  media: MeetRoomController;
  layout: CallLayout;
  focus?: string | null;
}) {
  controller = useStageLayout({
    accountId: 'u',
    meetingId: 'm',
    isAvailable: () => true,
    tier: 'desktop',
  });
  return (
    <div style={{ width: 1200, height: 800 }}>
      <StageLayoutView
        controller={controller}
        peopleCount={2}
        activities={controller.openIds.map((id) => ({
          id,
          title: id,
          icon: () => null,
          content: <section aria-label={id}>Content</section>,
        }))}
        stage={
          <CallStage
            room={media}
            layout={layout}
            compact={controller.openIds.length > 0}
            focus={focus}
            onFocus={vi.fn()}
            onChat={vi.fn()}
          />
        }
      />
    </div>
  );
}
const view = (
  media: MeetRoomController,
  layout: CallLayout,
  focus?: string | null
) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <Harness media={media} layout={layout} focus={focus} />
  </NextIntlClientProvider>
);

it.each(['auto', 'grid', 'spotlight', 'sidebar'] as CallLayout[])(
  'keeps actual media mounted with activities open, collapsed and closed in %s',
  (layout) => {
    const media = room();
    const { container } = render(view(media, layout));
    const tile = screen.getByTestId('participant-peer-camera');
    const audio = tile.querySelector('audio');
    const video = tile.querySelector('video');
    fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
    expect(audio?.muted).toBe(true);
    const steps: (() => void)[] = [
      () => controller.open('document'),
      () => controller.open('programming'),
      () => controller.setStrip('pill'),
      () => controller.setStrip('row'),
      () => controller.maximize(controller.layout.focusedPaneId),
      () => controller.maximize(null),
      () => controller.close('programming'),
      () => controller.close('document'),
    ];
    for (const step of steps) {
      act(step);
      expect(screen.getByTestId('participant-peer-camera')).toBe(tile);
      expect(tile.querySelector('video')).toBe(video);
      expect(tile.querySelector('audio')).toBe(audio);
      expect(container.querySelectorAll('audio')).toHaveLength(1);
      expect(audio?.muted).toBe(true);
      for (let el: Element | null = tile; el; el = el.parentElement)
        expect(el.classList.contains('hidden')).toBe(false);
    }
    expect(controller.openIds).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Peer for me' }));
    expect(audio?.muted).toBe(false);
  }
);

it('preserves every camera and screen media node while layouts, focus and activities change', () => {
  const media = room();
  media.state.participants.second = {
    userId: 'second',
    displayName: 'Second',
    media: { audioEnabled: true, videoEnabled: true, screenEnabled: true },
  } as MeetRealtimePresence;
  media.remoteMedia.second = {
    audio: { kind: 'audio' } as MediaStreamTrack,
    video: { kind: 'video' } as MediaStreamTrack,
    screen: { kind: 'video' } as MediaStreamTrack,
    screen_audio: { kind: 'audio' } as MediaStreamTrack,
  };
  const { rerender, container } = render(view(media, 'grid'));
  const ids = ['peer-camera', 'second-camera', 'second-screen'];
  const nodes = ids.map((id) => screen.getByTestId(`participant-${id}`));
  const videos = nodes.map((node) => node.querySelector('video'));
  const audio = nodes.map((node) => node.querySelector('audio'));
  fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
  for (const open of [true, false]) {
    act(() =>
      open ? controller.open('document') : controller.close('document')
    );
    for (const layout of ['auto', 'sidebar', 'spotlight', 'grid'] as const) {
      rerender(view(media, layout, 'second:screen'));
      ids.forEach((id, index) => {
        const node = screen.getByTestId(`participant-${id}`);
        expect(node).toBe(nodes[index]);
        expect(node.querySelector('video')).toBe(videos[index]);
        expect(node.querySelector('audio')).toBe(audio[index]);
      });
      expect(container.querySelectorAll('audio')).toHaveLength(3);
      expect(audio[0]?.muted).toBe(true);
      expect(audio[1]?.muted).toBe(false);
    }
  }
  rerender(view(media, 'spotlight', 'departed:camera'));
  expect(screen.getByTestId('participant-second-screen')).toBe(nodes[2]);
});
