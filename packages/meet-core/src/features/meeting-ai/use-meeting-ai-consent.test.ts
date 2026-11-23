// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: { removeQueries: vi.fn() },
  update: vi.fn(),
  upload: vi.fn(),
  stop: vi.fn(),
  refetch: vi.fn(),
  onChunk: null as
    | null
    | ((
        audio: Blob,
        seconds: number,
        source?: { accountId?: string; kind: 'microphone' | 'shared_audio' }
      ) => void),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetAiState: vi.fn(),
  updateMeetAiSession: mocks.update,
  uploadMeetAiChunk: mocks.upload,
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: vi.fn(),
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.client,
  useQuery: () => ({ data: { sessions: [] }, refetch: mocks.refetch }),
  useMutation: ({ mutationFn }: { mutationFn: unknown }) => ({
    mutateAsync: mutationFn,
  }),
}));
vi.mock('./audio', () => ({
  MeetAudioCapture: class {
    constructor(callback: NonNullable<typeof mocks.onChunk>) {
      // Real capture attributes every clip to an account.
      mocks.onChunk = (audio, seconds, source) =>
        callback(
          audio,
          seconds,
          source ?? { accountId: 'acct', kind: 'microphone' }
        );
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

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(WorkspaceVisibilityProvider, { actorId: 'actor-a', children });

it('keeps audio on the device while someone has not allowed the transcript', async () => {
  vi.useFakeTimers();
  let consentReady = false;
  const hook = renderHook(
    () =>
      useMeetingAi('workspace', 'meeting', [], true, true, 'actor-a', {
        consentReady,
      }),
    { wrapper }
  );
  await act(() => hook.result.current.start());
  await act(async () => {
    mocks.onChunk?.(new Blob(['paused']), 0);
    await vi.advanceTimersByTimeAsync(10_100);
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  consentReady = true;
  hook.rerender();
  await act(async () => {
    mocks.onChunk?.(new Blob(['allowed']), 11);
    await vi.advanceTimersByTimeAsync(10_100);
  });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(hook.result.current.captureError).toBe(false);
  hook.unmount();
});

it('treats a room consent refusal as a pause, not a capture failure', async () => {
  vi.useFakeTimers();
  mocks.upload.mockRejectedValueOnce(
    Object.assign(new Error('consent'), {
      status: 409,
      code: 'MEET_TRANSCRIPT_CONSENT_REQUIRED',
    })
  );
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'), {
    wrapper,
  });
  await act(() => hook.result.current.start());
  await act(async () => {
    mocks.onChunk?.(new Blob(['audio']), 1);
    await vi.advanceTimersByTimeAsync(10_100);
  });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(hook.result.current.captureError).toBe(false);
  expect(hook.result.current.capturing).toBe(true);
  hook.unmount();
});

it('reports the starting and finishing phases', async () => {
  let resolveStart!: (value: { sessionId: string }) => void;
  mocks.update.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStart = resolve;
    })
  );
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'), {
    wrapper,
  });
  let started!: Promise<void>;
  act(() => {
    started = hook.result.current.start();
  });
  await waitFor(() => expect(hook.result.current.phase).toBe('starting'));
  await act(async () => {
    resolveStart({ sessionId: 'session' });
    await started;
  });
  expect(hook.result.current.phase).toBeNull();
  hook.unmount();
});

it('drops a window that began before everyone allowed, even if it arrives after', async () => {
  vi.useFakeTimers();
  let consentReady = false;
  const hook = renderHook(
    () =>
      useMeetingAi('workspace', 'meeting', [], true, true, 'actor-a', {
        consentReady,
      }),
    { wrapper }
  );
  await act(() => hook.result.current.start());
  consentReady = true;
  hook.rerender();
  // Ten seconds of 16 kHz PCM16 audio that started while someone was undecided.
  const tenSeconds = new Blob([new Uint8Array(44 + 32_000 * 10)]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    mocks.onChunk?.(tenSeconds, 0);
    await vi.advanceTimersByTimeAsync(10_100);
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  hook.unmount();
});

it('never sends audio that cannot be attributed to an account', async () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useMeetingAi('workspace', 'meeting'), {
    wrapper,
  });
  await act(() => hook.result.current.start());
  await act(async () => {
    mocks.onChunk?.(new Blob(['audio']), 0, { kind: 'microphone' });
    await vi.advanceTimersByTimeAsync(10_100);
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  hook.unmount();
});
