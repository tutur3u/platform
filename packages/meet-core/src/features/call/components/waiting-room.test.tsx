// @vitest-environment jsdom
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
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { ConnectedLobby } from './call-lobby';
import { Lobby } from './lobby';

function localized(child: ReactNode, locale: 'en' | 'vi' = 'en') {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : viMessages}
      timeZone="UTC"
    >
      {child}
    </NextIntlClientProvider>
  );
}

const baseProps = {
  defaultDisplayName: 'Minh Tran',
  meetingName: 'Weekly Product Sync',
  connectionStatus: 'open' as const,
  error: null,
  isJoining: false,
  waiting: false,
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  onRetry: vi.fn(),
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(['en', 'vi'] as const)(
  'renders room title, participant avatars/count, overflow, and transcription notice in %s',
  (locale) => {
    const copy = locale === 'en' ? en.meet.call : viMessages.meet.call;
    const view = render(
      localized(
        <Lobby
          {...baseProps}
          transcriptionNotice="Live transcription is active"
        />,
        locale
      )
    );

    expect(
      screen.getByRole('heading', { name: 'Weekly Product Sync' })
    ).toBeTruthy();
    expect(screen.getByText(copy.lobby_nobody_here)).toBeTruthy();
    expect(
      screen
        .getAllByRole('status')
        .some((el) => el.textContent?.includes('Live transcription is active'))
    ).toBe(true);

    const roster = [
      { userId: 'u1', displayName: 'Alice Nguyen' },
      { userId: 'u2', displayName: 'Bao Le' },
      { userId: 'u3', displayName: 'Chi Pham' },
      { userId: 'u4', displayName: 'Dung Vo' },
      { userId: 'u5', displayName: 'Giang Ho' },
      { userId: 'u6', displayName: 'Hanh Do' },
    ];
    view.rerender(
      localized(<Lobby {...baseProps} participants={roster} />, locale)
    );
    expect(screen.queryByText(copy.lobby_nobody_here)).toBeNull();
    expect(screen.getByText('+2')).toBeTruthy();
    expect(
      screen.getByText(
        locale === 'en' ? '6 people in the call' : '6 người đang trong cuộc gọi'
      )
    ).toBeTruthy();
  }
);

it('drives mic level meter, camera preview, device pickers, and clean track handoff', async () => {
  const stopAudio = vi.fn();
  const stopVideo = vi.fn();
  const audioTrack = {
    kind: 'audio',
    enabled: true,
    muted: false,
    readyState: 'live',
    stop: stopAudio,
  } as unknown as MediaStreamTrack;
  const videoTrack = {
    kind: 'video',
    enabled: true,
    readyState: 'live',
    stop: stopVideo,
  } as unknown as MediaStreamTrack;

  vi.stubGlobal(
    'MediaStream',
    class MockMediaStream {
      constructor(private tracks: MediaStreamTrack[] = []) {}
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === 'video');
      }
      getTracks() {
        return this.tracks;
      }
    }
  );
  vi.stubGlobal(
    'AudioContext',
    class MockAudioContext {
      state = 'running';
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          smoothingTimeConstant: 0,
          disconnect: vi.fn(),
          getFloatTimeDomainData: (buf: Float32Array) => buf.fill(0.12),
        };
      }
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
    }
  );

  Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    value: vi.fn(async () => {}),
  });

  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) =>
    constraints.video
      ? new MediaStream([videoTrack])
      : new MediaStream([audioTrack])
  );
  const enumerateDevices = vi.fn(
    async () =>
      [
        { kind: 'audioinput', deviceId: 'mic-usb', label: 'USB Studio Mic' },
        { kind: 'videoinput', deviceId: 'cam-ext', label: '4K Webcam' },
        { kind: 'audiooutput', deviceId: 'spk-desk', label: 'Desk Speakers' },
      ] as MediaDeviceInfo[]
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });

  const onJoin = vi.fn();
  render(localized(<Lobby {...baseProps} onJoin={onJoin} />));

  const meter = screen.getByRole('meter', {
    name: en.meet.call.lobby_mic_level,
  });
  await waitFor(() =>
    expect((meter as HTMLMeterElement).value).toBeGreaterThan(40)
  );

  // Mute stops local lobby mic capture and resets meter to 0; unmuting resumes.
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.mute }));
  expect(stopAudio).toHaveBeenCalledTimes(1);
  expect((meter as HTMLMeterElement).value).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.unmute }));
  await waitFor(() =>
    expect((meter as HTMLMeterElement).value).toBeGreaterThan(40)
  );

  // Pick specific mic, camera, and speaker devices via accessible comboboxes.
  fireEvent.click(screen.getByLabelText(en.meet.call.audio_input));
  fireEvent.click(
    await screen.findByRole('option', { name: 'USB Studio Mic' })
  );

  fireEvent.click(screen.getByLabelText(en.meet.call.video_input));
  fireEvent.click(await screen.findByRole('option', { name: '4K Webcam' }));

  fireEvent.click(screen.getByLabelText(en.meet.call.audio_output));
  fireEvent.click(await screen.findByRole('option', { name: 'Desk Speakers' }));

  // Turn camera preview on — acquires from selected 4K Webcam.
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.camera_on }));
  await waitFor(() =>
    expect(getUserMedia).toHaveBeenCalledWith({
      video: expect.objectContaining({
        deviceId: { exact: 'cam-ext' },
      }),
    })
  );

  // Join stops the lobby mic stream, keeps preview video alive for handoff, and passes device IDs.
  stopAudio.mockClear();
  stopVideo.mockClear();
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.join_now }));

  expect(stopAudio).toHaveBeenCalledOnce();
  expect(stopVideo).not.toHaveBeenCalled();
  expect(onJoin).toHaveBeenCalledWith(
    expect.objectContaining({
      audioEnabled: true,
      videoEnabled: true,
      audioDeviceId: 'mic-usb',
      videoDeviceId: 'cam-ext',
      outputDeviceId: 'spk-desk',
      displayName: 'Minh Tran',
    })
  );
});

it('lets guests edit their display name, blocks blank names, and orders ConnectedLobby device adoption', async () => {
  const order: string[] = [];
  const room = {
    connectionStatus: 'open',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
    state: {
      ...INITIAL_CALL_STATE,
      admission: 'admitted',
      title: 'Renamed by Host',
    },
    getSelectedDevices: () => ({
      audio: '',
      video: '',
      microphoneRevision: 0,
    }),
    setDisplayName: vi.fn((name: string) => order.push(`name:${name}`)),
    selectDevice: vi.fn(async (kind: string, id: string) => {
      order.push(`select:${kind}:${id}`);
    }),
    adoptPreview: vi.fn(async () => {
      order.push('adopt');
    }),
    toggleMicrophone: vi.fn(async () => {
      order.push('mic');
    }),
    toggleCamera: vi.fn(async () => {
      order.push('cam');
    }),
  } as unknown as MeetRoomController;

  const onJoined = vi.fn();
  const onOutputDeviceChange = vi.fn();
  render(
    localized(
      <ConnectedLobby
        canReadWorkspace={false}
        defaultDisplayName="Guest"
        joined={false}
        meetingName="Fallback Title"
        onJoined={onJoined}
        onLeave={vi.fn()}
        onOutputDeviceChange={onOutputDeviceChange}
        onRetry={vi.fn()}
        outputDeviceId=""
        participants={[{ userId: 'h1', displayName: 'Host Lan' }]}
        prepareJoin={(enabled) => enabled}
        room={room}
        runMediaAction={(action) => action()}
      />
    )
  );

  expect(screen.getByRole('heading', { name: 'Renamed by Host' })).toBeTruthy();

  const nameInput = screen.getByLabelText(
    en.meet.call.your_name
  ) as HTMLInputElement;
  const joinButton = screen.getByRole('button', {
    name: en.meet.call.join_now,
  }) as HTMLButtonElement;

  fireEvent.change(nameInput, { target: { value: '   ' } });
  expect(joinButton.disabled).toBe(true);

  fireEvent.change(nameInput, { target: { value: '  Linh Guest  ' } });
  expect(joinButton.disabled).toBe(false);
  fireEvent.keyDown(nameInput, { key: 'Enter' });

  await waitFor(() => expect(order).toContain('mic'));
  expect(onJoined).toHaveBeenCalledOnce();
  expect(order).toEqual([
    'name:Linh Guest',
    'select:audio:',
    'select:video:',
    'adopt',
    'mic',
  ]);
});

it('sends the guest name on blur only when it changed and skips the duplicate on join', async () => {
  const room = {
    connectionStatus: 'open',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
    state: { ...INITIAL_CALL_STATE, admission: 'admitted' },
    getSelectedDevices: () => ({ audio: '', video: '', microphoneRevision: 0 }),
    setDisplayName: vi.fn(),
    selectDevice: vi.fn(async () => {}),
    adoptPreview: vi.fn(async () => {}),
    toggleMicrophone: vi.fn(async () => {}),
    toggleCamera: vi.fn(async () => {}),
  } as unknown as MeetRoomController;

  render(
    localized(
      <ConnectedLobby
        canReadWorkspace={false}
        defaultDisplayName="Guest"
        meetingName="Standup"
        onJoined={vi.fn()}
        onLeave={vi.fn()}
        onOutputDeviceChange={vi.fn()}
        onRetry={vi.fn()}
        outputDeviceId=""
        participants={[]}
        prepareJoin={(enabled) => enabled}
        room={room}
        runMediaAction={(action) => action()}
      />
    )
  );

  const nameInput = screen.getByLabelText(
    en.meet.call.your_name
  ) as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Linh Anh' } });
  fireEvent.blur(nameInput);
  fireEvent.blur(nameInput);
  fireEvent.change(nameInput, { target: { value: 'Linh Anh ' } });
  fireEvent.blur(nameInput);
  expect(room.setDisplayName).toHaveBeenCalledOnce();
  expect(room.setDisplayName).toHaveBeenLastCalledWith('Linh Anh', room.media);

  fireEvent.keyDown(nameInput, { key: 'Enter' });
  await waitFor(() => expect(room.adoptPreview).toHaveBeenCalled());
  expect(room.setDisplayName).toHaveBeenCalledOnce();
});

it('sends a changed guest name again after an earlier blur', () => {
  const room = {
    connectionStatus: 'open',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
    state: { ...INITIAL_CALL_STATE, admission: 'admitted' },
    getSelectedDevices: () => ({ audio: '', video: '', microphoneRevision: 0 }),
    setDisplayName: vi.fn(),
  } as unknown as MeetRoomController;

  render(
    localized(
      <ConnectedLobby
        canReadWorkspace={false}
        defaultDisplayName="Guest"
        meetingName="Standup"
        onJoined={vi.fn()}
        onLeave={vi.fn()}
        onOutputDeviceChange={vi.fn()}
        onRetry={vi.fn()}
        outputDeviceId=""
        participants={[]}
        prepareJoin={(enabled) => enabled}
        room={room}
        runMediaAction={(action) => action()}
      />
    )
  );

  const nameInput = screen.getByLabelText(
    en.meet.call.your_name
  ) as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Linh' } });
  fireEvent.blur(nameInput);
  fireEvent.change(nameInput, { target: { value: 'Linh Anh' } });
  fireEvent.blur(nameInput);
  expect(
    vi.mocked(room.setDisplayName).mock.calls.map(([name]) => name)
  ).toEqual(['Linh', 'Linh Anh']);
});

it('handles blocked camera/mic permissions, unsupported speaker selection, and read-only member identity', async () => {
  Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId');
  const getUserMedia = vi.fn(async () => {
    throw new DOMException('Permission denied', 'NotAllowedError');
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });

  render(localized(<Lobby {...baseProps} isGuest={false} />));

  // Member identity is read-only (no editable Your name input).
  expect(screen.queryByLabelText(en.meet.call.your_name)).toBeNull();
  expect(screen.getByText('Minh Tran')).toBeTruthy();

  // Speaker selector disables gracefully when setSinkId is unsupported.
  expect(
    (screen.getByLabelText(en.meet.call.audio_output) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(screen.getByText(en.meet.call.output_unsupported)).toBeTruthy();

  // Denied mic permission switches mic off and explains why.
  await waitFor(() =>
    expect(screen.getByText(en.meet.call.lobby_mic_blocked)).toBeTruthy()
  );

  // Turning camera on when blocked reverts to off and shows camera_blocked.
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.camera_on }));
  await waitFor(() =>
    expect(screen.getByText(en.meet.call.camera_blocked)).toBeTruthy()
  );
});
