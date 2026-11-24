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

vi.mock('./guest-lobby-upgrade', () => ({ GuestLobbyUpgrade: () => null }));

import {
  forgetMiraJoinChoice,
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
  acceptance: {
    revision: 2,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  choice: null,
  lastChoice: null,
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

let client: QueryClient;
function wrap(child: ReactNode) {
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {child}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
function showLobby(onJoined = vi.fn(), controller: MeetRoomController = room) {
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
        room={controller}
        runMediaAction={(action) => action()}
        miraMeetingId="room"
      />
    )
  );
  return onJoined;
}
const showCall = () => render(wrap(<RoomMiraNotice meetingId="room" />));

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  forgetMiraJoinChoice('room');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    seenRevision: 2,
  });
  showLobby();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.join_now }));
  await waitFor(() =>
    expect(peekMiraJoinChoice('room')?.textHash).not.toBe('c'.repeat(64))
  );
  expect(peekMiraJoinChoice('room')?.ticked).toBe(false);
  // The acceptance open on the lobby is the one the Join state applies to.
  expect(peekMiraJoinChoice('room')?.seenRevision).toBe(2);
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
  // No evidence hash can be made, so nothing is remembered for the call.
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no crypto'));
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

it('seeds the lobby box once, so a changed default never overwrites the participant', async () => {
  showLobby();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(box);
  expect(box.getAttribute('aria-checked')).toBe('false');
  for (const boxTickedByDefault of [false, true]) {
    f.read.mockResolvedValue({ ...accepted, boxTickedByDefault });
    await client.invalidateQueries();
    await waitFor(() => expect(f.read).toHaveBeenCalled());
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(
    screen
      .getByRole('checkbox', { name: m.box_label })
      .getAttribute('aria-checked')
  ).toBe('false');
});

const outside = (over: Record<string, unknown> = {}) => ({
  available: false,
  joinDefault: true,
  joinRevision: 0,
  ...over,
});
const waitingRoom = {
  ...room,
  state: { ...room.state, admission: 'waiting' },
} as unknown as MeetRoomController;

it('tells someone outside the room that Mira is on, without naming anyone', async () => {
  f.read.mockResolvedValue(outside({ joinRevision: 2 }));
  showLobby();
  expect(await screen.findByText(m.lobby_notice)).toBeTruthy();
  // The acceptor is named by the indicator once the person is admitted.
  expect(screen.queryByText(/Lan/)).toBeNull();
  expect(
    await screen.findByRole('checkbox', { name: m.box_label })
  ).toBeTruthy();
});

it('shows no Mira notice while no acceptance is open', async () => {
  f.read.mockResolvedValue(outside({ joinRevision: 0 }));
  showLobby();
  await screen.findByRole('checkbox', { name: m.box_label });
  expect(screen.queryByText(m.lobby_notice)).toBeNull();
});

it('shows the notice in the waiting room and learns of a later acceptance', async () => {
  f.read.mockResolvedValue(outside({ joinRevision: 0 }));
  showLobby(vi.fn(), waitingRoom);
  await screen.findByRole('checkbox', { name: m.box_label });
  expect(screen.queryByText(m.lobby_notice)).toBeNull();
  // The host turns Mira on while this person waits; the next read shows it.
  f.read.mockResolvedValue(outside({ joinRevision: 5 }));
  await client.invalidateQueries();
  expect(await screen.findByText(m.lobby_notice)).toBeTruthy();
});

it('refreshes only while Mira is offered and the caller is outside', async () => {
  f.read.mockResolvedValue(outside({ joinRevision: 1 }));
  showLobby();
  await screen.findByText(m.lobby_notice);
  const query = client.getQueryCache().getAll()[0]!;
  const interval = (
    query.observers[0]!.options as {
      refetchInterval: (q: unknown) => number | false;
    }
  ).refetchInterval;
  const read = (data: unknown) => interval({ state: { data } });
  expect(read(outside())).toBe(20_000);
  // Mira unavailable here, or the caller already admitted: no polling.
  expect(read({ available: false })).toBe(false);
  expect(read(accepted)).toBe(false);
});

it('starts the lobby box unticked for someone whose own last choice here was off', async () => {
  f.read.mockResolvedValue(outside({ joinRevision: 2, joinLastChoice: 'off' }));
  showLobby();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
});

it('keeps the off over a remembered ticked Join state, and ticks otherwise', async () => {
  rememberMiraJoinChoice('room', {
    ticked: true,
    textHash: 'c'.repeat(64),
    locale: 'en',
    seenRevision: 2,
  });
  f.read.mockResolvedValue(outside({ joinRevision: 2, joinLastChoice: 'off' }));
  showLobby();
  const off = await screen.findByRole('checkbox', { name: m.box_label });
  expect(off.getAttribute('aria-checked')).toBe('false');
  cleanup();
  forgetMiraJoinChoice('room');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  f.read.mockResolvedValue(outside({ joinRevision: 2, joinLastChoice: 'on' }));
  showLobby();
  const on = await screen.findByRole('checkbox', { name: m.box_label });
  expect(on.getAttribute('aria-checked')).toBe('true');
});
