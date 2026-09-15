// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  upload: vi.fn(),
  stop: vi.fn(),
  refetch: vi.fn(),
  onChunk: null as null | ((audio: Blob, seconds: number) => void),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetAiState: vi.fn(),
  updateMeetAiSession: mocks.update,
  uploadMeetAiChunk: mocks.upload,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { sessions: [] }, refetch: mocks.refetch }),
  useMutation: ({ mutationFn }: { mutationFn: unknown }) => ({
    mutateAsync: mutationFn,
  }),
}));
vi.mock('./audio', () => ({
  MeetAudioCapture: class {
    constructor(callback: typeof mocks.onChunk) {
      mocks.onChunk = callback;
    }
    async start() {}
    update() {}
    dispose() {}
    stop = mocks.stop;
  },
}));

import { useMeetingAi } from './use-meeting-ai';

afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ sessionId: 'session' });
  mocks.upload.mockResolvedValue({ status: 'completed' });
  mocks.stop.mockResolvedValue(true);
});

it('marks a missing final flush as incomplete', async () => {
  mocks.stop.mockResolvedValue(false);
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'));
  await act(() => hook.result.current.start());
  await act(() => hook.result.current.finish());
  expect(mocks.update).toHaveBeenLastCalledWith('workspace', 'meeting', {
    action: 'finish',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessionId: 'session',
    expectedChunks: 0,
    captureIncomplete: true,
  });
  hook.unmount();
});

it('drains queued uploads and finalizes when capture overloads', async () => {
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'));
  await act(() => hook.result.current.start());
  await act(async () => {
    for (let index = 0; index < 61; index++)
      mocks.onChunk?.(new Blob(['audio']), index * 10);
  });
  await waitFor(() =>
    expect(mocks.update).toHaveBeenLastCalledWith('workspace', 'meeting', {
      action: 'finish',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sessionId: 'session',
      expectedChunks: 1,
      captureIncomplete: true,
    })
  );
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(hook.result.current.ownsSession).toBe(false);
  hook.unmount();
});

it('waits for an in-flight start before finalizing for leave', async () => {
  let resolveStart!: (value: { sessionId: string }) => void;
  mocks.update.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStart = resolve;
    })
  );
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'));
  await act(async () => {
    const started = hook.result.current.start();
    await Promise.resolve();
    const finished = hook.result.current.finish();
    resolveStart({ sessionId: 'session' });
    await Promise.all([started, finished]);
  });
  expect(mocks.update).toHaveBeenLastCalledWith('workspace', 'meeting', {
    action: 'finish',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessionId: 'session',
    expectedChunks: 0,
    captureIncomplete: false,
  });
  expect(hook.result.current.ownsSession).toBe(false);
  hook.unmount();
});

it('counts simultaneous sources as one upload window and flushes final audio on finish', async () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'));
  await act(() => hook.result.current.start());
  await act(async () => {
    for (let index = 0; index < 12; index++)
      mocks.onChunk?.(new Blob(['audio']), 0);
    await vi.advanceTimersByTimeAsync(10_100);
  });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  const data = mocks.upload.mock.calls[0]?.[2] as FormData;
  expect(JSON.parse(String(data.get('sources')))).toHaveLength(12);
  await act(async () => {
    mocks.onChunk?.(new Blob(['final']), 10);
    await hook.result.current.finish();
  });
  expect(mocks.upload).toHaveBeenCalledTimes(2);
  expect(mocks.update).toHaveBeenLastCalledWith(
    'workspace',
    'meeting',
    expect.objectContaining({
      action: 'finish',
      expectedChunks: 2,
      captureIncomplete: false,
    })
  );
  hook.unmount();
});
it('finishes before the wall-clock server expiry even when there is no speech', async () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'));
  await act(() => hook.result.current.start());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000 - 15_000);
  });
  expect(mocks.update).toHaveBeenLastCalledWith(
    'workspace',
    'meeting',
    expect.objectContaining({
      action: 'finish',
      expectedChunks: 0,
      captureIncomplete: false,
    })
  );
  expect(hook.result.current.capturing).toBe(false);
  hook.unmount();
});
