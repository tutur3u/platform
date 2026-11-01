// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { Lobby } from './lobby';

function localized(child: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}

function lobbyProps(overrides: Partial<Parameters<typeof Lobby>[0]> = {}) {
  return {
    defaultDisplayName: '',
    meetingName: 'Weekly Product Sync',
    connectionStatus: 'open' as const,
    error: null,
    isGuest: true,
    isJoining: false,
    waiting: false,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onRetry: vi.fn(),
    onDisplayNameChange: vi.fn(),
    ...overrides,
  };
}

type FakeTrack = MediaStreamTrack & { end: () => void };

function fakeTrack(kind: 'audio' | 'video'): FakeTrack {
  const listeners = new Set<() => void>();
  return {
    kind,
    enabled: true,
    muted: false,
    readyState: 'live',
    stop: vi.fn(),
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'ended') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'ended') listeners.delete(listener);
    },
    end: () => {
      for (const listener of [...listeners]) listener();
    },
  } as unknown as FakeTrack;
}

function fakeStream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
  } as unknown as MediaStream;
}

function missingDevice(name: 'OverconstrainedError' | 'NotFoundError') {
  return Object.assign(new Error(name), { name });
}

/** Install navigator.mediaDevices; returns every track handed out per kind. */
function installMediaDevices({
  devices = [],
  reject,
}: {
  devices?: MediaDeviceInfo[];
  reject?: (constraints: MediaStreamConstraints) => Error | undefined;
} = {}) {
  const tracks = { audio: [] as FakeTrack[], video: [] as FakeTrack[] };
  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    const failure = reject?.(constraints);
    if (failure) throw failure;
    const kind = constraints.video ? 'video' : 'audio';
    const track = fakeTrack(kind);
    tracks[kind].push(track);
    return fakeStream([track]);
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => devices),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  return { getUserMedia, tracks };
}

function nameInput() {
  return screen.getByLabelText(en.meet.call.your_name) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('keeps spaces while a guest types a multi-word name keystroke by keystroke', () => {
  const props = lobbyProps();
  render(localized(<Lobby {...props} />));
  const input = nameInput();

  let typed = '';
  for (const key of ['L', 'i', 'n', 'h', ' ', 'A', 'n', 'h']) {
    typed += key;
    fireEvent.change(input, { target: { value: typed } });
    expect(input.value).toBe(typed);
  }
  expect(input.value).toBe('Linh Anh');

  fireEvent.change(input, { target: { value: '  Linh Anh  ' } });
  expect(input.value).toBe('  Linh Anh  ');
  fireEvent.blur(input);
  expect(input.value).toBe('Linh Anh');
  expect(props.onDisplayNameChange).toHaveBeenCalledWith('Linh Anh');

  fireEvent.change(input, { target: { value: 'Trần Thị ' } });
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.join_now }));
  expect(props.onJoin).toHaveBeenCalledWith(
    expect.objectContaining({ displayName: 'Trần Thị' })
  );
});

it('leaves IME composition text untouched and caps the length once it commits', () => {
  const props = lobbyProps();
  render(localized(<Lobby {...props} />));
  const input = nameInput();

  // Telex: "Linh Aa" composes to "Linh Â"; the trailing space must survive.
  fireEvent.change(input, { target: { value: 'Linh ' } });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'Linh A' } });
  expect(input.value).toBe('Linh A');
  fireEvent.change(input, { target: { value: 'Linh Â' } });
  expect(input.value).toBe('Linh Â');
  fireEvent.compositionEnd(input);
  expect(input.value).toBe('Linh Â');

  // Over-long composition text is not cut mid-composition, only on commit.
  const long = `${'a'.repeat(MAX_DISPLAY_NAME_LENGTH - 1)}ươ`;
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: long } });
  expect(input.value).toBe(long);
  fireEvent.compositionEnd(input);
  expect(input.value).toBe(long.slice(0, MAX_DISPLAY_NAME_LENGTH));

  // Enter while composing confirms the IME candidate instead of joining.
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(props.onJoin).not.toHaveBeenCalled();
});

it('retries a stale microphone or camera id with the system default instead of reporting a block', async () => {
  const { getUserMedia } = installMediaDevices({
    reject: (constraints) => {
      const audio = constraints.audio as MediaTrackConstraints | boolean;
      const video = constraints.video as MediaTrackConstraints | boolean;
      if (typeof audio === 'object')
        return missingDevice('OverconstrainedError');
      if (typeof video === 'object') return missingDevice('NotFoundError');
      return undefined;
    },
  });
  render(
    localized(
      <Lobby
        {...lobbyProps({
          initialAudioDeviceId: 'mic-from-last-session',
          initialVideoDeviceId: 'cam-unplugged',
        })}
      />
    )
  );

  await waitFor(() =>
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  );
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: { deviceId: { exact: 'mic-from-last-session' } },
  });

  fireEvent.click(screen.getByRole('button', { name: en.meet.call.camera_on }));
  await waitFor(() =>
    expect(getUserMedia).toHaveBeenCalledWith({ video: true })
  );
  expect(getUserMedia).toHaveBeenCalledWith({
    video: expect.objectContaining({ deviceId: { exact: 'cam-unplugged' } }),
  });

  expect(screen.queryByText(en.meet.call.lobby_mic_blocked)).toBeNull();
  expect(screen.queryByText(en.meet.call.camera_blocked)).toBeNull();
  expect(screen.getByRole('button', { name: en.meet.call.mute })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: en.meet.call.camera_off })
  ).toBeTruthy();
});

it('still reports a block when the system default device itself is missing', async () => {
  installMediaDevices({ reject: () => missingDevice('NotFoundError') });
  render(localized(<Lobby {...lobbyProps()} />));

  await waitFor(() =>
    expect(screen.getByText(en.meet.call.lobby_mic_blocked)).toBeTruthy()
  );
  expect(
    screen.getByRole('button', { name: en.meet.call.unmute })
  ).toBeTruthy();
});

it('drops selected ids the labelled device list no longer has', async () => {
  const onOutputDeviceChange = vi.fn();
  const { getUserMedia } = installMediaDevices({
    devices: [
      { kind: 'audioinput', deviceId: 'mic-new', label: 'USB Mic' },
      { kind: 'videoinput', deviceId: 'cam-new', label: 'Webcam' },
      { kind: 'audiooutput', deviceId: 'spk-new', label: 'Speakers' },
    ] as MediaDeviceInfo[],
  });
  render(
    localized(
      <Lobby
        {...lobbyProps({
          initialAudioDeviceId: 'mic-old',
          initialVideoDeviceId: 'cam-old',
          outputDeviceId: 'spk-old',
          onOutputDeviceChange,
        })}
      />
    )
  );

  await waitFor(() =>
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true })
  );
  await waitFor(() => expect(onOutputDeviceChange).toHaveBeenCalledWith(''));

  fireEvent.click(screen.getByRole('button', { name: en.meet.call.camera_on }));
  await waitFor(() =>
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: true })
  );
  expect(getUserMedia).not.toHaveBeenCalledWith({
    video: expect.objectContaining({ deviceId: { exact: 'cam-old' } }),
  });
});

it('keeps unlabelled device lists from clearing a selection before permission', async () => {
  const { getUserMedia } = installMediaDevices({
    devices: [
      { kind: 'audioinput', deviceId: 'mic-a', label: '' },
    ] as MediaDeviceInfo[],
    reject: (constraints) =>
      constraints.audio
        ? new DOMException('denied', 'NotAllowedError')
        : undefined,
  });
  render(
    localized(<Lobby {...lobbyProps({ initialAudioDeviceId: 'mic-b' })} />)
  );

  await waitFor(() =>
    expect(screen.getByText(en.meet.call.lobby_mic_blocked)).toBeTruthy()
  );
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: { deviceId: { exact: 'mic-b' } },
  });
});

it('falls back to the system default when a live preview track ends', async () => {
  const { getUserMedia, tracks } = installMediaDevices();
  render(
    localized(<Lobby {...lobbyProps({ initialAudioDeviceId: 'mic-usb' })} />)
  );

  await waitFor(() => expect(tracks.audio).toHaveLength(1));
  tracks.audio[0]?.end();
  await waitFor(() =>
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true })
  );

  // Losing the default device too re-acquires whatever is the default now.
  await waitFor(() => expect(tracks.audio).toHaveLength(2));
  tracks.audio[1]?.end();
  await waitFor(() => expect(tracks.audio).toHaveLength(3));
  expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true });

  fireEvent.click(screen.getByRole('button', { name: en.meet.call.camera_on }));
  await waitFor(() => expect(tracks.video).toHaveLength(1));
  tracks.video[0]?.end();
  await waitFor(() => expect(tracks.video).toHaveLength(2));
  expect(screen.queryByText(en.meet.call.camera_blocked)).toBeNull();
});

it('announces a blocked microphone in a status region with the camera on too', async () => {
  installMediaDevices({
    reject: (constraints) =>
      constraints.audio
        ? new DOMException('denied', 'NotAllowedError')
        : undefined,
  });
  render(localized(<Lobby {...lobbyProps()} />));

  fireEvent.click(screen.getByRole('button', { name: en.meet.call.camera_on }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: en.meet.call.camera_off })
    ).toBeTruthy()
  );
  await waitFor(() =>
    expect(
      screen
        .getAllByRole('status')
        .some((region) =>
          region.textContent?.includes(en.meet.call.lobby_mic_blocked)
        )
    ).toBe(true)
  );
});
