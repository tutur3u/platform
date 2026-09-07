// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  toggle: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  toggleWorkspaceMeetingRecording: api.toggle,
  updateWorkspaceMeetingRecording: api.update,
  uploadWorkspaceMeetingRecording: api.upload,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { useCallRecording } from './use-call-recording';

const stopped = vi.fn();
class Recorder extends EventTarget {
  static isTypeSupported() {
    return true;
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', { value: new Blob(['audio']) });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event('stop'));
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  api.update.mockResolvedValue({});
  api.upload.mockResolvedValue({});
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: stopped }] }),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const options = {
  meetingId: 'meeting',
  wsId: 'workspace',
  onStateChange: vi.fn(),
};
it.each(['started', 'stopped'])(
  'cancels pending %s without toggling another session',
  async (action) => {
    let resolve!: (value: unknown) => void;
    api.toggle.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { result } = renderHook(() => useCallRecording(options));
    let pending!: Promise<void>;
    act(() => {
      void result.current.toggle();
    });
    await waitFor(() => expect(api.toggle).toHaveBeenCalledOnce());
    act(() => {
      pending = result.current.stop();
    });
    expect(stopped).toHaveBeenCalled();
    await act(async () => {
      resolve({ action, sessionId: 'specific-session' });
      await pending;
    });
    expect(api.toggle).toHaveBeenCalledOnce();
    if (action === 'started')
      expect(api.update).toHaveBeenCalledWith(
        'workspace',
        'meeting',
        'specific-session',
        { status: 'failed' },
        'PUT'
      );
    else expect(api.update).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  }
);
it('finalizes captured data on component unmount', async () => {
  api.toggle.mockResolvedValue({
    action: 'started',
    sessionId: 'owned-session',
  });
  const { result, unmount } = renderHook(() => useCallRecording(options));
  await act(async () => {
    await result.current.toggle();
  });
  expect(result.current.isRecording).toBe(true);
  unmount();
  await waitFor(() => expect(api.upload).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      'workspace',
      'meeting',
      'owned-session',
      { status: 'pending_transcription' },
      'PUT'
    )
  );
  expect(stopped).toHaveBeenCalled();
  expect(api.toggle).toHaveBeenCalledOnce();
});
it('shares the in-flight finalizer with a concurrent leave', async () => {
  api.toggle.mockResolvedValue({
    action: 'started',
    sessionId: 'owned-session',
  });
  let finishUpload!: (value: unknown) => void;
  api.upload.mockImplementation(
    () =>
      new Promise((done) => {
        finishUpload = done;
      })
  );
  const { result } = renderHook(() => useCallRecording(options));
  await act(async () => {
    await result.current.toggle();
  });
  let first!: Promise<void>, second!: Promise<void>;
  act(() => {
    first = result.current.stop();
    second = result.current.stop();
  });
  expect(first).toBe(second);
  await waitFor(() => expect(api.upload).toHaveBeenCalledOnce());
  await act(async () => {
    finishUpload({});
    await first;
  });
  expect(api.update).toHaveBeenCalledOnce();
});
