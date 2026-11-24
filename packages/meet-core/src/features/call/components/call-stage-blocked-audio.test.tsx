// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { CallStage } from './call-stage';

const mocks = vi.hoisted(() => ({
  phone: true,
  retries: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('../phone/use-phone-chrome', () => ({
  usePhoneChrome: () => mocks.phone,
}));
vi.mock('./participant-tile', () => ({
  ParticipantTile: ({
    focusKey,
    onPlaybackBlocked,
  }: {
    focusKey: string;
    onPlaybackBlocked?: (key: string, retry: (() => void) | null) => void;
  }) => (
    <div data-testid={focusKey}>
      {onPlaybackBlocked && (
        <>
          <button
            onClick={() => {
              mocks.retries[focusKey] ??= vi.fn();
              onPlaybackBlocked(focusKey, mocks.retries[focusKey] as never);
            }}
            type="button"
          >
            block {focusKey}
          </button>
          <button
            onClick={() => onPlaybackBlocked(focusKey, null)}
            type="button"
          >
            clear {focusKey}
          </button>
        </>
      )}
    </div>
  ),
}));

const call = messages.meet.call;
const person = (userId: string) => ({
  userId,
  displayName: userId,
  media: { audioEnabled: true, videoEnabled: true, screenEnabled: false },
});

function renderStage() {
  const ids = ['me', 'u1', 'u2', 'u3', 'u4', 'u5'];
  const room = {
    remoteMedia: {},
    state: {
      ...INITIAL_CALL_STATE,
      selfUserId: 'me',
      participants: Object.fromEntries(ids.map((id) => [id, person(id)])),
    },
  } as unknown as MeetRoomController;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallStage
        focus={null}
        layout="auto"
        onChat={vi.fn()}
        onFocus={vi.fn()}
        room={room}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  mocks.phone = true;
  mocks.retries = {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const resume = () => screen.queryByRole('button', { name: call.resume_audio });

it('offers one Play meeting audio press when only filmstrip tiles are blocked', () => {
  renderStage();
  expect(resume()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'block u4:camera' }));
  fireEvent.click(screen.getByRole('button', { name: 'block u5:camera' }));
  const button = resume() as HTMLElement;
  expect(button).toBeTruthy();
  expect(button.className).toContain('h-11');
});

it('retries every blocked tile in the one press', () => {
  renderStage();
  fireEvent.click(screen.getByRole('button', { name: 'block u4:camera' }));
  fireEvent.click(screen.getByRole('button', { name: 'block u5:camera' }));
  fireEvent.click(resume() as HTMLElement);
  expect(mocks.retries['u4:camera']).toHaveBeenCalledTimes(1);
  expect(mocks.retries['u5:camera']).toHaveBeenCalledTimes(1);
});

it('hides once every blocked tile reports clear', async () => {
  renderStage();
  fireEvent.click(screen.getByRole('button', { name: 'block u4:camera' }));
  fireEvent.click(screen.getByRole('button', { name: 'block u5:camera' }));
  fireEvent.click(screen.getByRole('button', { name: 'clear u4:camera' }));
  expect(resume()).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'clear u5:camera' }));
  await waitFor(() => expect(resume()).toBeNull());
});

it('is absent off a phone layout, where tiles keep their own chip', () => {
  mocks.phone = false;
  renderStage();
  expect(screen.queryByRole('button', { name: /block/ })).toBeNull();
  expect(resume()).toBeNull();
});
