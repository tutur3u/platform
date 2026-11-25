// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { GuestVerificationProvider } from '../components/guest-verification-context';
import { JoinOutcome } from '../components/join-outcome';
import type { PrejoinCapture } from './use-prejoin-capture';

vi.mock('../components/guest-lobby-upgrade', () => ({
  GuestLobbyUpgrade: () => <div data-testid="guest-upgrade" />,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
const rename = vi.hoisted(() =>
  vi.fn(async (_id: string, name: string) => ({ name }))
);
vi.mock('@tuturuuu/internal-api', () => ({ updateMeetCallTitle: rename }));

import { ConnectedPrejoin } from './connected-prejoin';
import { forgetGuestMedia, rememberGuestMedia } from './guest-prejoin-media';
import { PrejoinProvider } from './prejoin-context';

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
    reset: vi.fn(),
    finish: vi.fn(),
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
    error?: string;
    handedOff?: boolean;
    meetingIdFromProvider?: boolean;
    guestRequest?: boolean;
    permissionPending?: boolean;
    verified?: boolean;
  } = {}
) {
  const cap = capture();
  if (options.permissionPending) cap.audioPermissionPending = true;
  if (options.guestRequest) rememberGuestMedia('m-guest', cap);
  if (options.handedOff)
    (cap as unknown as { handedOff: boolean }).handedOff = true;
  const controller = room(options.admission ?? 'admitted', {}, options.role);
  if (options.error)
    (controller.state as unknown as { error: string }).error = options.error;
  const onJoined = vi.fn();
  const onLeave = vi.fn();
  const Wrap = options.meetingIdFromProvider
    ? ({ children }: { children: React.ReactNode }) => (
        <PrejoinProvider
          info={{
            meetingId: 'm-9',
            meetingName: 'Weekly sync',
            displayName: 'Linh Tran',
            leaveHref: '/home',
          }}
        >
          {children}
        </PrejoinProvider>
      )
    : ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Wrap>
        <GuestVerificationProvider
          value={
            options.guestRequest
              ? {
                  meetingId: 'm-guest',
                  siteKey: 'site',
                  verified: options.verified ?? false,
                }
              : null
          }
        >
          <ConnectedPrejoin
            canReadWorkspace={options.canReadWorkspace ?? true}
            capture={cap}
            defaultDisplayName={options.name ?? 'Linh Tran'}
            joined={options.joined ?? false}
            meetingName="Weekly sync"
            miraMeetingId={
              options.guestRequest ? 'm-guest' : options.miraMeetingId
            }
            guestRequest={options.guestRequest}
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
        </GuestVerificationProvider>
      </Wrap>
    </NextIntlClientProvider>
  );
  return { cap, controller, onJoined, onLeave, unmount: view.unmount };
}

afterEach(() => {
  cleanup();
  forgetGuestMedia('m-guest');
  vi.clearAllMocks();
});

it('hands off devices after guest admission without another click', () => {
  const { cap, onJoined } = show({ guestRequest: true, verified: true });
  expect(screen.getByRole('status').textContent).toBe(
    call.prejoin.guest_admitted
  );
  expect(
    screen.queryByRole('button', { name: call.prejoin.guest_join })
  ).toBeNull();
  expect(cap.handOff).toHaveBeenCalledOnce();
  expect(onJoined).toHaveBeenCalledOnce();
});

it('keeps a manually admitted guest on the single pending device choice', () => {
  const { cap, onJoined } = show({
    guestRequest: true,
    permissionPending: true,
  });
  expect(screen.getByRole('status').textContent).toBe(
    call.prejoin.guest_confirm
  );
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  expect(
    screen.getByRole('switch', { name: call.prejoin.guest_microphone })
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: call.prejoin.guest_join })
  ).toHaveProperty('disabled', true);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(cap.handOff).not.toHaveBeenCalled();
  expect(onJoined).not.toHaveBeenCalled();
});

it('summarizes the completed guest fields and opens them on Edit', () => {
  show({ guestRequest: true, permissionPending: true, verified: true });
  expect(
    screen.getByText(
      `${call.prejoin.guest_summary.replace('{name}', 'Linh Tran')} · ${call.guest_join.verified}`
    )
  ).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: call.prejoin.guest_edit })
  );
  expect(screen.getByRole('textbox', { name: call.your_name })).toHaveProperty(
    'value',
    'Linh Tran'
  );
  expect(screen.getByText(call.guest_join.verified)).toBeTruthy();
});

it.each(['connecting', 'waiting'])(
  'keeps joining gated during %s',
  (admission) => {
    const { onJoined } = show({ guestRequest: true, admission });
    const expected =
      admission === 'waiting'
        ? call.prejoin.guest_waiting
        : call.prejoin.guest_joining;
    expect(screen.getByRole('status').textContent).toBe(expected);
    expect(onJoined).not.toHaveBeenCalled();
  }
);

it('shows the guest denial copy after the room refuses admission', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PrejoinProvider
        info={{
          meetingId: 'm-guest',
          meetingName: 'Weekly sync',
          displayName: 'Linh Tran',
          leaveHref: '/',
          guest: true,
        }}
      >
        <JoinOutcome reason="denied" guestRequest />
      </PrejoinProvider>
    </NextIntlClientProvider>
  );
  expect(
    screen.getByRole('heading', { name: call.prejoin.guest_denied })
  ).toBeTruthy();
  expect(screen.getByText(call.prejoin.guest_denied_hint)).toBeTruthy();
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
  expect(screen.queryByRole('checkbox')).toBeNull();
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

it('draws the host title as plain heading text at rest', () => {
  show({ role: 'host', miraMeetingId: 'm-1' });
  const field = screen.getByRole('textbox', { name: call.meeting_title });
  expect(field.className).toContain('[--field-stroke:transparent]');
  expect(field.className).toContain('hover:[--field-stroke:var(--border)]');
  expect(field.className).toContain(
    'focus-visible:[--field-stroke:var(--border)]'
  );
});

it('lets a host rename the meeting without a Mira meeting id', () => {
  show({ role: 'host', meetingIdFromProvider: true });
  expect(
    screen.getByRole('textbox', { name: call.meeting_title })
  ).toBeTruthy();
});

it('takes the devices back for a retry after a failed join', () => {
  const { cap } = show({ error: 'closed', handedOff: true });
  expect(cap.reset).toHaveBeenCalledTimes(1);
});

it('leaves a fresh preview alone when nothing failed', () => {
  const { cap } = show({});
  expect(cap.reset).not.toHaveBeenCalled();
});

it('keeps the preview when a resource refusal may still clear', () => {
  const { cap } = show({ error: 'admission_closed', handedOff: true });
  expect(cap.reset).not.toHaveBeenCalled();
});

it('ends the preview when the stage goes away', () => {
  const { cap, unmount } = show({});
  expect(cap.finish).not.toHaveBeenCalled();
  unmount();
  expect(cap.finish).toHaveBeenCalledTimes(1);
});
