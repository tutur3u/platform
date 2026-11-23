// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  transcript: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: f.read,
  setRoomMiraChoice: f.choose,
  setMeetTranscriptChoice: f.transcript,
  acceptRoomMira: vi.fn(),
  turnOffRoomMira: vi.fn(),
  reportRoomMiraMinor: vi.fn(),
}));

import {
  peekMiraJoinChoice,
  rememberMiraJoinChoice,
} from '../../live-assistant/mira-join-choice';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { ConnectedLobby } from './call-lobby';
import { RoomMiraNotice } from './room-mira-notice';

const m = en.meet.mira_consent;
const accepted = {
  available: true,
  version: 'v',
  acceptance: { revision: 2, acceptorName: 'Lan', capabilities: ['chat'] },
  choice: null,
  pausing: false,
  ready: false,
  canAccept: false,
  status: { active: true, included: 0, admitted: 2 },
  boxTickedByDefault: true,
};
const room = {
  connectionStatus: 'open',
  media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
  state: { ...INITIAL_CALL_STATE, admission: 'admitted', role: 'speaker' },
  getSelectedDevices: () => ({ audio: '', video: '', microphoneRevision: 0 }),
  setDisplayName: vi.fn(),
  selectDevice: vi.fn(async () => undefined),
  adoptPreview: vi.fn(async () => undefined),
  toggleMicrophone: vi.fn(async () => undefined),
  toggleCamera: vi.fn(async () => undefined),
} as unknown as MeetRoomController;

function wrap(child: ReactNode) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {child}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
function showLobby(onJoined = vi.fn()) {
  render(
    wrap(
      <ConnectedLobby
        canReadWorkspace={false}
        defaultDisplayName="Guest"
        joined={false}
        meetingName="Room"
        onJoined={onJoined}
        onLeave={vi.fn()}
        onOutputDeviceChange={vi.fn()}
        onRetry={vi.fn()}
        outputDeviceId=""
        participants={[]}
        prepareJoin={() => false}
        room={room}
        runMediaAction={(action) => action()}
        miraJoin={{ meetingId: 'room', boxTickedByDefault: true }}
      />
    )
  );
  return onJoined;
}
const showCall = () =>
  render(wrap(<RoomMiraNotice meetingId="room" placement="header" />));

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  f.read.mockResolvedValue(accepted);
  f.transcript.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps a guest-page untick unticked in the lobby and records off after admission', async () => {
  // The guest page unticked the box.
  rememberMiraJoinChoice('room', {
    ticked: false,
    textHash: 'c'.repeat(64),
    locale: 'en',
  });
  showLobby();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.join_now }));
  await waitFor(() =>
    expect(peekMiraJoinChoice('room')?.textHash).not.toBe('c'.repeat(64))
  );
  expect(peekMiraJoinChoice('room')?.ticked).toBe(false);
  cleanup();

  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  showCall();
  await waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith(
      'room',
      expect.objectContaining({
        choice: 'off',
        source: 'join',
        acceptanceRevision: 2,
      })
    )
  );
  // Off declines the transcript in the room; no Allow is ever sent.
  expect(f.transcript).not.toHaveBeenCalled();
});

it('still joins when the box cannot be remembered, and leaves the participant off', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('private mode');
  });
  const onJoined = showLobby();
  await screen.findByRole('checkbox', { name: m.box_label });
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.join_now }));
  await waitFor(() => expect(onJoined).toHaveBeenCalledOnce());
  cleanup();

  showCall();
  // Nothing is recorded for them; the call asks them to confirm instead.
  expect(await screen.findByRole('button', { name: m.confirm })).toBeTruthy();
  expect(f.choose).not.toHaveBeenCalled();
  expect(f.transcript).not.toHaveBeenCalled();
});
