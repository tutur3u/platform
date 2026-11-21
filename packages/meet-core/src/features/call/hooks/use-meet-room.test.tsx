// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
  meetRoomSettingsSchema,
} from '@tuturuuu/realtime/meet';
import { useMeetRoom } from './use-meet-room';
import { INITIAL_CALL_STATE } from '../lib/call-state';

const mock = vi.hoisted(() => ({
  receive: (_message: unknown) => {},
  request: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  construct: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMeetCallRealtimeToken: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/room-audio', () => ({
  deliverRoomAssistantAudio: vi.fn(),
}));
vi.mock('../lib/signaling', () => ({
  MeetSignaling: class {
    constructor(options: { onMessage: (message: unknown) => void }) {
      mock.receive = options.onMessage;
    }
    connect() {}
    close() {}
    send = mock.send;
    request = mock.request;
  },
}));
vi.mock('../lib/peer-recovery', () => ({ watchPeerRecovery: vi.fn() }));
vi.mock('../lib/receiver-health', () => ({ watchReceiverHealth: vi.fn() }));

function receive(message: unknown) {
  act(() => mock.receive(message));
}
function join(transport?: 'presence' | 'media') {
  receive({
    type: 'ready',
    role: 'host',
    userId: 'self',
    admission: 'admitted',
    stage: INITIAL_CALL_STATE.stage,
  });
  receive({
    type: 'room.settings',
    settings: { shareNotes: false, ...(transport ? { transport } : {}) },
  });
  receive({
    type: 'presence',
    roomId: 'room',
    presence: [
      {
        userId: 'self',
        displayName: 'Self',
        media: {
          audioEnabled: false,
          videoEnabled: false,
          screenEnabled: false,
        },
      },
      {
        userId: 'other',
        displayName: 'Other',
        media: {
          audioEnabled: true,
          videoEnabled: false,
          screenEnabled: false,
        },
      },
    ],
  });
  receive({
    type: 'track.published',
    tracks: [
      {
        userId: 'other',
        sessionId: 'remote',
        trackName: 'other-audio',
        kind: 'audio',
      },
    ],
  });
}
function mount() {
  vi.stubGlobal(
    'MediaStream',
    class {
      getTracks() {
        return [];
      }
      getAudioTracks() {
        return [];
      }
      getVideoTracks() {
        return [];
      }
    }
  );
  vi.stubGlobal(
    'RTCPeerConnection',
    class extends EventTarget {
      constructor() {
        super();
        mock.construct();
      }
      close = mock.close;
    }
  );
  mock.request.mockImplementation(() => new Promise(() => {}));
  return renderHook(() =>
    useMeetRoom({
      meetingId: 'test',
      wsId: 'test',
      realtimeUrl: 'ws://test',
      token: 'test',
    })
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('keeps presence while blocking microphone, camera, screen and SFU transport', async () => {
  const getUserMedia = vi.fn();
  const getDisplayMedia = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia, getDisplayMedia },
  });
  const hook = mount();
  join('presence');
  await act(async () => {
    await hook.result.current.toggleMicrophone();
    await hook.result.current.unmuteMicrophone();
    await hook.result.current.toggleCamera();
    await hook.result.current.toggleScreenShare();
    await hook.result.current.selectDevice('audio', 'microphone');
  });
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(getDisplayMedia).not.toHaveBeenCalled();
  expect(mock.construct).not.toHaveBeenCalled();
  expect(mock.request).not.toHaveBeenCalled();
  expect(mock.send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'presence.update' })
  );
});

it('allows the default subscriber and closes it when the host switches to presence', async () => {
  mount();
  join();
  await waitFor(() => expect(mock.construct).toHaveBeenCalled());
  expect(mock.request).toHaveBeenCalledWith({ type: 'sfu.session.create' });
  receive({
    type: 'room.settings',
    settings: { shareNotes: false, transport: 'presence' },
  });
  expect(mock.close).toHaveBeenCalled();
  const requests = mock.request.mock.calls.length;
  await act(async () => {
    await Promise.resolve();
  });
  expect(mock.request).toHaveBeenCalledTimes(requests);
});

it('defaults room settings to media and rejects provider entry in presence rooms', () => {
  expect(meetRoomSettingsSchema.parse({}).transport).toBe('media');
  const token = meetRealtimeTokenPayloadSchema.parse({
    exp: 9999999999,
    limits: {},
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    mode: 'call',
    role: 'host',
    roomId: 'workspace:meeting',
    scopes: getMeetRealtimeScopesForRole('host'),
    userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  });
  const now = '2026-11-21T12:00:00.000Z';
  const state = admitOrHold(createMeetRoomSnapshot(), token, now).state;
  const run = () =>
    applyMeetRoomCommand(state, {
      token,
      now,
      message: { type: 'sfu.session.create', requestId: 'request' },
    });
  expect(run().sfu).not.toBeNull();
  state.settings = { shareNotes: false, transport: 'presence' };
  expect(run().sfu).toBeNull();
  expect(run().reply).toEqual([expect.objectContaining({ type: 'error' })]);
});

it('discards microphone permission that resolves after a switch to presence', async () => {
  let resolve!: (stream: MediaStream) => void;
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((done) => {
        resolve = done;
      })
  );
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const hook = mount();
  receive({ type: 'room.settings', settings: { shareNotes: false } });
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.result.current.toggleMicrophone();
    await Promise.resolve();
  });
  expect(getUserMedia).toHaveBeenCalledOnce();
  receive({
    type: 'room.settings',
    settings: { shareNotes: false, transport: 'presence' },
  });
  const stop = vi.fn();
  const track = { stop } as unknown as MediaStreamTrack;
  await act(async () => {
    resolve({
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream);
    await pending;
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(hook.result.current.media.audioEnabled).toBe(false);
  expect(mock.construct).not.toHaveBeenCalled();
  expect(mock.request).not.toHaveBeenCalled();
});
