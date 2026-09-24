// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MeetRoomController } from '../lib/room-controller';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  upload: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  uploadMeetRoomRecording: mocks.upload,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../lib/room-recorder', () => ({
  RoomRecorder: class {
    prepare = mocks.prepare;
    dispose = mocks.dispose;
    update() {}
    async start() {
      return { getVideoTracks: () => [{}] };
    }
  },
}));

import { useRoomRecording } from './use-room-recording';

class Recorder extends EventTarget {
  static instance: Recorder;
  static isTypeSupported() {
    return true;
  }
  constructor() {
    super();
    Recorder.instance = this;
  }
  state = 'inactive';
  mimeType = 'video/webm';
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', { value: new Blob(['media']) });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event('stop'));
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({});
  vi.stubGlobal('MediaRecorder', Recorder);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const makeRoom = (control: MeetRoomController['controlRecording']) =>
  ({
    controlRecording: control,
    state: {
      recording: { state: 'idle', sessionId: null },
      selfUserId: 'self',
      ended: false,
    },
  }) as unknown as MeetRoomController;
it('unlocks audio before requesting the shared lease and saves before releasing it', async () => {
  const control = vi.fn(async () => undefined);
  const room = makeRoom(control);
  const { result } = renderHook(() => useRoomRecording(room, 'meeting', []));
  await act(async () => {
    await result.current.toggle();
  });
  expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(
    control.mock.invocationCallOrder[0]!
  );
  expect(result.current.isRecording).toBe(true);
  await act(async () => {
    await result.current.stop();
  });
  expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
    control.mock.invocationCallOrder.at(-1)!
  );
  expect(result.current.isRecording).toBe(false);
});
it('does not restore recording UI after cancellation during the recording acknowledgement', async () => {
  let acknowledge!: () => void;
  const control = vi.fn(async (state: string) => {
    if (state === 'recording')
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
  });
  const room = makeRoom(control);
  const { result } = renderHook(() => useRoomRecording(room, 'meeting', []));
  let start!: Promise<void>;
  act(() => {
    start = result.current.toggle();
  });
  await waitFor(() => expect(acknowledge).toBeTypeOf('function'));
  await act(async () => {
    await result.current.stop();
    acknowledge();
    await start;
  });
  expect(result.current.isRecording).toBe(false);
});
it('does not upload failed capture as a ready room recording', async () => {
  const room = makeRoom(vi.fn(async () => undefined));
  const { result } = renderHook(() => useRoomRecording(room, 'meeting', []));
  await act(async () => {
    await result.current.toggle();
  });
  await act(async () => {
    Recorder.instance.dispatchEvent(new Event('error'));
  });
  await waitFor(() => expect(result.current.isRecording).toBe(false));
  expect(mocks.upload).not.toHaveBeenCalled();
});
