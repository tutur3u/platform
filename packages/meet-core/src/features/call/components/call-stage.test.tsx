// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { CallStage } from './call-stage';

vi.mock('./participant-tile', () => ({
  ParticipantTile: ({
    focusKey,
    className,
  }: {
    focusKey: string;
    className: string;
  }) => <div data-testid={focusKey} className={className} />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('puts pinned, sharing and speaking tiles first and keeps off-page audio mounted', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(private readonly tracks: MediaStreamTrack[]) {}
      getTracks() {
        return this.tracks;
      }
    }
  );
  const names = Array.from({ length: 50 }, (_, index) => `p${index + 1}`);
  const participants = Object.fromEntries(
    names.map((userId) => [
      userId,
      {
        userId,
        displayName: userId,
        media: {
          audioEnabled: true,
          videoEnabled: true,
          screenEnabled: userId === 'p49',
        },
      },
    ])
  );
  const remoteMedia = Object.fromEntries(
    names.map((userId) => [
      userId,
      {
        audio: { kind: 'audio' },
        ...(userId === 'p49' ? { screen_audio: { kind: 'audio' } } : {}),
      },
    ])
  );
  const setStageVideoWindow = vi.fn();
  const room = {
    setStageVideoWindow,
    remoteMedia,
    state: { ...INITIAL_CALL_STATE, participants, recentSpeakerIds: ['p48'] },
  } as unknown as MeetRoomController;
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallStage
        room={room}
        layout="grid"
        focus="p50:camera"
        onFocus={vi.fn()}
        onChat={vi.fn()}
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('Page 1 of 7')).toBeDefined();
  expect(screen.getAllByTestId(/^(p\d+):(camera|screen)$/)).toHaveLength(9);
  expect(
    screen
      .getAllByTestId(/^(p\d+):(camera|screen)$/)
      .slice(0, 3)
      .map((tile) => tile.dataset.testid)
  ).toEqual(['p49:screen', 'p50:camera', 'p48:camera']);
  const audio = [...container.querySelectorAll('audio[data-stage-audio]')];
  expect(audio).toHaveLength(51);
  const share = screen.getByTestId('p49:screen');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByTestId('p49:screen')).toBe(share);
  expect(screen.getByText('Page 2 of 7')).toBeDefined();
  expect(screen.queryByTestId('p50:camera')).toBeNull();
  expect([...container.querySelectorAll('audio[data-stage-audio]')]).toEqual(
    audio
  );
  expect(setStageVideoWindow).toHaveBeenLastCalledWith(
    expect.arrayContaining(['p50']),
    undefined
  );
});

it('resizes and resets the shared-screen split without replacing its tile', () => {
  const participant = {
    userId: 'presenter',
    displayName: 'Presenter',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: true },
  };
  const room = {
    remoteMedia: {},
    state: {
      ...INITIAL_CALL_STATE,
      participants: { presenter: participant },
    },
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallStage
        room={room}
        layout="grid"
        focus={null}
        onFocus={vi.fn()}
        onChat={vi.fn()}
      />
    </NextIntlClientProvider>
  );
  const tile = screen.getByTestId('presenter:screen');
  const separator = screen.getByRole('separator', {
    name: 'Resize spotlight and filmstrip',
  });
  expect(tile.className).toContain('col-span-full');
  expect(screen.getByTestId('presenter:camera').className).toContain(
    'row-start-3'
  );
  expect(separator.getAttribute('aria-orientation')).toBe('horizontal');
  fireEvent.keyDown(separator, { key: 'ArrowUp' });
  expect(separator.getAttribute('aria-valuenow')).toBe('73');
  fireEvent.doubleClick(separator);
  expect(separator.getAttribute('aria-valuenow')).toBe('78');
  expect(screen.getByTestId('presenter:screen')).toBe(tile);
});

it('shows the local share while the room presence update is still in flight', () => {
  const self = {
    userId: 'presenter',
    displayName: 'Presenter',
    media: { audioEnabled: false, videoEnabled: true, screenEnabled: false },
  };
  const room = {
    remoteMedia: {},
    screenStream: {},
    state: {
      ...INITIAL_CALL_STATE,
      selfUserId: self.userId,
      participants: { presenter: self },
    },
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallStage
        room={room}
        layout="auto"
        focus={null}
        onFocus={vi.fn()}
        onChat={vi.fn()}
        hideSelfCamera
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByTestId('presenter:screen').className).toContain(
    'col-span-full'
  );
  expect(screen.queryByTestId('presenter:camera')).toBeNull();
});
