// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import type { PrejoinCapture } from './use-prejoin-capture';

const remember = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../live-assistant/mira-join-box', () => ({
  useRememberMiraJoin: () => remember,
}));
vi.mock('../components/call-lobby', () => ({
  LobbyMiraBox: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="mira-box">{meetingId}</div>
  ),
}));
vi.mock('../components/guest-lobby-upgrade', () => ({
  GuestLobbyUpgrade: () => <div data-testid="guest-upgrade" />,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
const rename = vi.hoisted(() =>
  vi.fn(async (_id: string, name: string) => ({ name }))
);
vi.mock('@tuturuuu/internal-api', () => ({ updateMeetCallTitle: rename }));

import { ConnectedPrejoin } from './connected-prejoin';

const call = messages.meet.call;

function capture() {
  const media = {
    previewStream: null,
    audioEnabled: true,
    videoEnabled: false,
    audioDeviceId: '',
    videoDeviceId: '',
    outputDeviceId: '',
  };
  return {
    devices: [],
    audioEnabled: true,
    videoEnabled: false,
    toggleAudio: vi.fn(),
    toggleVideo: vi.fn(),
    micStream: null,
    previewStream: null,
    previewError: null,
    micError: null,
    handedOff: false,
    limited: false,
    setLimit: vi.fn(),
    setAudioDeviceId: vi.fn(),
    setVideoDeviceId: vi.fn(),
    setOutputDeviceId: vi.fn(),
    audioDeviceId: '',
    videoDeviceId: '',
    outputDeviceId: '',
    handOff: vi.fn(() => media),
    release: vi.fn(),
  } as unknown as PrejoinCapture;
}

function room(
  admission: string,
  overrides: Record<string, unknown> = {},
  role = 'participant'
) {
  return {
    state: {
      role,
      settings: { transport: 'media' },
      error: null,
      admission,
      title: 'Weekly sync',
    },
    connectionStatus: 'open',
    media: {},
    setDisplayName: vi.fn(),
    selectDevice: vi.fn(async () => {}),
    adoptPreview: vi.fn(async () => {}),
    toggleMicrophone: vi.fn(async () => {}),
    toggleCamera: vi.fn(async () => {}),
    updateSettings: vi.fn(),
    renameMeeting: vi.fn(),
    ...overrides,
  } as unknown as MeetRoomController & Record<string, ReturnType<typeof vi.fn>>;
}

function show(
  options: {
    joined?: boolean;
    admission?: string;
    canReadWorkspace?: boolean;
    name?: string;
    miraMeetingId?: string;
    role?: string;
  } = {}
) {
  const cap = capture();
  const controller = room(options.admission ?? 'idle', {}, options.role);
  const onJoined = vi.fn();
  const onLeave = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConnectedPrejoin
        canReadWorkspace={options.canReadWorkspace ?? true}
        capture={cap}
        defaultDisplayName={options.name ?? 'Linh Tran'}
        joined={options.joined ?? false}
        meetingName="Weekly sync"
        miraMeetingId={options.miraMeetingId}
        onJoined={onJoined}
        onLeave={onLeave}
        onOutputDeviceChange={vi.fn()}
        onRetry={vi.fn()}
        outputDeviceId=""
        participants={[]}
        prepareJoin={() => true}
        room={controller}
        runMediaAction={async (action) => action()}
      />
    </NextIntlClientProvider>
  );
  return { cap, controller, onJoined, onLeave };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('is ready with no name field when the profile has a name, and joins on press', async () => {
  const { cap, controller, onJoined } = show({ miraMeetingId: 'm-1' });
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('Linh Tran')).toBeTruthy();
  // A plain muted line, not a bordered pill.
  const nobody = screen.getByText(call.lobby_nobody_here);
  expect(nobody.className).not.toMatch(/border|rounded|bg-/);
  expect(screen.queryByText(call.ready_to_join)).toBeNull();
  expect(screen.queryByText(call.leave)).toBeNull();
  expect(screen.getByTestId('mira-box').textContent).toBe('m-1');
  expect(
    screen.queryByText(messages.meet.call.guest_join.ask_to_join)
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: call.join_now }));
  expect(cap.handOff).toHaveBeenCalledTimes(1);
  expect(onJoined).toHaveBeenCalledTimes(1);
  expect(controller.selectDevice).toHaveBeenCalledWith('audio', '');
  expect(controller.setDisplayName).not.toHaveBeenCalled();
});

it('asks a guest for a name and holds Join until one is entered', () => {
  const { controller } = show({ canReadWorkspace: false, name: 'Guest' });
  const field = screen.getByRole('textbox', { name: call.your_name });
  fireEvent.change(field, { target: { value: '' } });
  expect(screen.getByRole('button', { name: call.join_now })).toHaveProperty(
    'disabled',
    true
  );
  fireEvent.change(field, { target: { value: 'Minh' } });
  fireEvent.click(screen.getByRole('button', { name: call.join_now }));
  expect(controller.setDisplayName).toHaveBeenCalledWith('Minh', {});
});

it('shows the spinner the moment Join is pressed, before the room answers', () => {
  show({ joined: true });
  const join = screen.getByRole('button', { name: new RegExp(call.join_now) });
  expect(join).toHaveProperty('disabled', true);
  expect(join.querySelector('svg.animate-spin')).toBeTruthy();
});

it('shows the connecting spinner while the room opens', () => {
  show({ admission: 'connecting' });
  const join = screen.getByRole('button', { name: new RegExp(call.join_now) });
  expect(join).toHaveProperty('disabled', true);
  expect(join.querySelector('svg.animate-spin')).toBeTruthy();
});

it('waits for the host with the cancel action and the guest upgrade slot', () => {
  const { cap, onLeave } = show({ admission: 'waiting' });
  expect(
    screen.getByRole('button', { name: call.waiting_for_host })
  ).toHaveProperty('disabled', true);
  expect(screen.getByTestId('guest-upgrade')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: call.join_cancel_request })
  );
  expect(cap.release).toHaveBeenCalledTimes(1);
  expect(onLeave).toHaveBeenCalledTimes(1);
});

it('lets the host rename the meeting inline and saves on blur', async () => {
  const { controller } = show({ role: 'host', miraMeetingId: 'm-1' });
  const field = screen.getByRole('textbox', { name: call.meeting_title });
  fireEvent.change(field, { target: { value: 'Planning' } });
  fireEvent.blur(field);
  await vi.waitFor(() =>
    expect(rename).toHaveBeenCalledWith('m-1', 'Planning')
  );
  await vi.waitFor(() =>
    expect(controller.renameMeeting).toHaveBeenCalledWith('Planning')
  );
});

it('shows the title as a plain heading to everyone else', () => {
  show({ miraMeetingId: 'm-1' });
  expect(screen.getByRole('heading', { name: 'Weekly sync' })).toBeTruthy();
  expect(
    screen.queryByRole('textbox', { name: call.meeting_title })
  ).toBeNull();
});
