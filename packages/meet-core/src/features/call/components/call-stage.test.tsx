// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { CallStage } from './call-stage';

vi.mock('./participant-tile', () => ({
  ParticipantTile: ({ focusKey }: { focusKey: string }) => (
    <div data-testid={focusKey} />
  ),
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
  expect(screen.getByText('Page 1 of 6')).toBeDefined();
  expect(screen.getAllByTestId(/^(p\d+):(camera|screen)$/)).toHaveLength(9);
  expect(
    screen
      .getAllByTestId(/^(p\d+):(camera|screen)$/)
      .slice(0, 3)
      .map((tile) => tile.dataset.testid)
  ).toEqual(['p50:camera', 'p49:screen', 'p48:camera']);
  const audio = [...container.querySelectorAll('audio[data-stage-audio]')];
  expect(audio).toHaveLength(51);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 2 of 6')).toBeDefined();
  expect(screen.queryByTestId('p50:camera')).toBeNull();
  expect([...container.querySelectorAll('audio[data-stage-audio]')]).toEqual(
    audio
  );
  expect(setStageVideoWindow).toHaveBeenLastCalledWith(
    expect.arrayContaining(['p50']),
    undefined
  );
});
