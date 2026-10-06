// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { type CallLayout, CallStage } from './call-stage';
import { CollaborationStageLayout } from './collaboration-stage-layout';

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
      stage: { raisedHandUserIds: [] },
    },
    remoteMedia: { peer: { audio: track } },
    localStream: null,
    screenStream: null,
  } as unknown as MeetRoomController;
}
it.each(['auto', 'grid', 'spotlight', 'sidebar'] as CallLayout[])(
  'keeps actual media mounted and controls usable alongside document and programming in %s',
  (layout) => {
    const controller = room();
    const view = (content: 'document' | 'programming' | null) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <CollaborationStageLayout
          layout={layout}
          content={
            content ? <section aria-label={content}>Content</section> : null
          }
          stage={
            <CallStage
              room={controller}
              layout={layout}
              compact={!!content}
              focus={null}
              onFocus={vi.fn()}
              onChat={vi.fn()}
            />
          }
        />
      </NextIntlClientProvider>
    );
    const { rerender, container } = render(view(null));
    const tile = screen.getByTestId('participant-peer-camera');
    const audio = tile.querySelector('audio');
    const video = tile.querySelector('video');
    fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
    expect(audio?.muted).toBe(true);
    for (const content of ['document', 'programming', null] as const) {
      rerender(view(content));
      expect(screen.getByTestId('participant-peer-camera')).toBe(tile);
      expect(tile.querySelector('video')).toBe(video);
      expect(tile.querySelector('audio')).toBe(audio);
      expect(container.querySelectorAll('audio')).toHaveLength(1);
      expect(audio?.muted).toBe(true);
      for (let el: Element | null = tile; el; el = el.parentElement)
        expect(el.classList.contains('hidden')).toBe(false);
      if (content)
        expect(screen.getByRole('region', { name: content })).toBeDefined();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Peer for me' }));
    expect(audio?.muted).toBe(false);
  }
);
it('uses a bounded mobile filmstrip and distinct desktop pane widths for each content layout', () => {
  const widths: string[] = [];
  for (const layout of [
    'auto',
    'grid',
    'spotlight',
    'sidebar',
  ] as CallLayout[]) {
    const { container, unmount } = render(
      <CollaborationStageLayout
        content={<div>Doc</div>}
        stage={<div>Peer</div>}
        layout={layout}
      />
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('flex-col lg:flex-row');
    const rail = wrapper.lastElementChild!;
    expect(rail.className).toContain('shrink-0');
    widths.push(rail.className);
    unmount();
  }
  expect(new Set(widths).size).toBe(3);
});

it('preserves every camera/screen media node and local playback state while changing modes and focus', () => {
  const controller = room();
  const second = {
    userId: 'second',
    displayName: 'Second',
    media: { audioEnabled: true, videoEnabled: true, screenEnabled: true },
  } as MeetRealtimePresence;
  controller.state.participants.second = second;
  controller.remoteMedia.second = {
    audio: { kind: 'audio' } as MediaStreamTrack,
    video: { kind: 'video' } as MediaStreamTrack,
    screen: { kind: 'video' } as MediaStreamTrack,
    screen_audio: { kind: 'audio' } as MediaStreamTrack,
  };
  const view = (layout: CallLayout, compact: boolean, focus: string | null) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <CollaborationStageLayout
        layout={layout}
        content={compact ? <section aria-label="document">Doc</section> : null}
        stage={
          <CallStage
            room={controller}
            layout={layout}
            compact={compact}
            focus={focus}
            onFocus={vi.fn()}
            onChat={vi.fn()}
          />
        }
      />
    </NextIntlClientProvider>
  );
  const { rerender, container } = render(view('grid', false, null));
  const ids = ['peer-camera', 'second-camera', 'second-screen'];
  const nodes = ids.map((id) => screen.getByTestId(`participant-${id}`));
  const videos = nodes.map((node) => node.querySelector('video'));
  const audio = nodes.map((node) => node.querySelector('audio'));
  fireEvent.click(screen.getByRole('button', { name: 'Mute Peer for me' }));
  for (const compact of [true, false]) {
    for (const layout of [
      'auto',
      'sidebar',
      'spotlight',
      'grid',
    ] as CallLayout[]) {
      rerender(view(layout, compact, 'second:screen'));
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
  rerender(view('spotlight', true, 'departed:camera'));
  expect(screen.getByTestId('participant-second-screen')).toBe(nodes[2]);
});
