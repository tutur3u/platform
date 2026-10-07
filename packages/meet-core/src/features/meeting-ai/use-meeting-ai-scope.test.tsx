// @vitest-environment jsdom
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import {
  type ReactNode,
  Suspense,
  useEffect,
  useState,
  useTransition,
} from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actorId: 'actor-a',
  update: vi.fn(),
  upload: vi.fn(),
  refetch: vi.fn(),
  dispose: vi.fn(),
  support: vi.fn(),
  client: { removeQueries: vi.fn() },
  chunk: null as null | ((audio: Blob, seconds: number) => void),
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
    constructor(callback: typeof mocks.chunk) {
      mocks.chunk = callback;
    }
    async start() {
      await mocks.support();
    }
    update() {}
    dispose = mocks.dispose;
    async stop() {
      return true;
    }
  },
}));

import { useMeetingAi } from './use-meeting-ai';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <WorkspaceVisibilityProvider actorId={mocks.actorId}>
      {children}
    </WorkspaceVisibilityProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actorId = 'actor-a';
  mocks.support.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({ sessionId: 'session-a' });
  mocks.upload.mockResolvedValue({ status: 'completed' });
});
afterEach(() => vi.useRealTimers());
for (const departure of ['workspace', 'meeting', 'actor']) {
  it(`does not install or finalize a held start after ${departure} A→B→A`, async () => {
    let release!: (value: { sessionId: string }) => void;
    mocks.update.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const hook = renderHook(
      ({ wsId, meetingId }) => useMeetingAi(wsId, meetingId),
      {
        wrapper,
        initialProps: { wsId: 'workspace-a', meetingId: 'meeting-a' },
      }
    );
    let started!: Promise<void>;
    await act(async () => {
      started = hook.result.current.start();
      await Promise.resolve();
    });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    if (departure === 'actor') mocks.actorId = 'actor-b';
    hook.rerender({
      wsId: departure === 'workspace' ? 'workspace-b' : 'workspace-a',
      meetingId: departure === 'meeting' ? 'meeting-b' : 'meeting-a',
    });
    mocks.actorId = 'actor-a';
    hook.rerender({ wsId: 'workspace-a', meetingId: 'meeting-a' });
    await act(async () => {
      release({ sessionId: 'session-a' });
      await started;
    });
    expect(hook.result.current.capturing).toBe(false);
    expect(hook.result.current.ownsSession).toBe(false);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.refetch).not.toHaveBeenCalled();
    hook.unmount();
  });
  it(`does not finalize or refetch a held upload after ${departure} A→B→A`, async () => {
    let release!: (value: { status: string }) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const hook = renderHook(
      ({ wsId, meetingId }) => useMeetingAi(wsId, meetingId),
      {
        wrapper,
        initialProps: { wsId: 'workspace-a', meetingId: 'meeting-a' },
      }
    );
    await act(() => hook.result.current.start());
    mocks.refetch.mockClear();
    let finished!: Promise<void>;
    await act(async () => {
      mocks.chunk?.(new Blob(['Synthetic audio']), 0);
      finished = hook.result.current.finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    if (departure === 'actor') mocks.actorId = 'actor-b';
    hook.rerender({
      wsId: departure === 'workspace' ? 'workspace-b' : 'workspace-a',
      meetingId: departure === 'meeting' ? 'meeting-b' : 'meeting-a',
    });
    mocks.actorId = 'actor-a';
    hook.rerender({ wsId: 'workspace-a', meetingId: 'meeting-a' });
    await act(async () => {
      release({ status: 'completed' });
      await finished;
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(hook.result.current.capturing).toBe(false);
    expect(hook.result.current.pendingChunks).toBe(0);
    hook.unmount();
  });
}

it('does not admit capture or ended-session retries without a verified actor', async () => {
  const hook = renderHook(() => useMeetingAi('workspace-a', 'meeting-a'));
  await act(async () => {
    await hook.result.current.start();
    await hook.result.current.finish('session-a');
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(hook.result.current.capturing).toBe(false);
  hook.unmount();
});
it('requires the caller account to match the verified actor', async () => {
  const hook = renderHook(
    () =>
      useMeetingAi('workspace-a', 'meeting-a', [], true, true, 'foreign-actor'),
    { wrapper }
  );
  await act(async () => {
    await hook.result.current.start();
    await hook.result.current.finish('session-a');
  });
  expect(mocks.update).not.toHaveBeenCalled();
  hook.unmount();
});
it('keeps a new scope capture intact when a departed held start settles', async () => {
  let release!: (value: { sessionId: string }) => void;
  mocks.update.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const hook = renderHook(({ wsId }) => useMeetingAi(wsId, 'meeting-a'), {
    wrapper,
    initialProps: { wsId: 'workspace-a' },
  });
  let oldStart!: Promise<void>;
  await act(async () => {
    oldStart = hook.result.current.start();
    await Promise.resolve();
  });
  hook.rerender({ wsId: 'workspace-b' });
  await act(() => hook.result.current.start());
  expect(hook.result.current.capturing).toBe(true);
  mocks.refetch.mockClear();
  await act(async () => {
    release({ sessionId: 'departed-session' });
    await oldStart;
  });
  expect(hook.result.current.capturing).toBe(true);
  expect(hook.result.current.ownsSession).toBe(true);
  expect(hook.result.current.busy).toBe(false);
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.refetch).not.toHaveBeenCalled();
  hook.unmount();
});
it('suppresses retained callbacks and buffered audio after scope departure', async () => {
  const hook = renderHook(({ wsId }) => useMeetingAi(wsId, 'meeting-a'), {
    wrapper,
    initialProps: { wsId: 'workspace-a' },
  });
  await act(() => hook.result.current.start());
  const oldStart = hook.result.current.start;
  const oldFinish = hook.result.current.finish;
  const oldChunk = mocks.chunk;
  hook.rerender({ wsId: 'workspace-b' });
  hook.rerender({ wsId: 'workspace-a' });
  mocks.refetch.mockClear();
  await act(async () => {
    oldChunk?.(new Blob(['Synthetic late audio']), 0);
    await oldStart();
    await oldFinish('session-a');
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.refetch).not.toHaveBeenCalled();
  expect(hook.result.current.capturing).toBe(false);
  hook.unmount();
});
it('admits the current verified actor after Strict Mode effect replay', async () => {
  const hook = renderHook(() => useMeetingAi('workspace-a', 'meeting-a'), {
    wrapper,
    reactStrictMode: true,
  });
  await act(() => hook.result.current.start());
  expect(hook.result.current.capturing).toBe(true);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('keeps committed A admitted while a suspended B render is abandoned', async () => {
  const hold = new Promise<never>(() => {});
  const handles: Record<string, ReturnType<typeof useMeetingAi>> = {};
  let transition!: () => void;
  let abandon!: () => void;
  function Fixture() {
    const [workspace, setWorkspace] = useState('workspace-a');
    const [, startTransition] = useTransition();
    handles[workspace] = useMeetingAi(workspace, 'meeting-a');
    transition = () => startTransition(() => setWorkspace('workspace-b'));
    abandon = () => setWorkspace('workspace-a');
    if (workspace === 'workspace-b') throw hold;
    return <div>Committed A</div>;
  }
  const tree = render(
    wrapper({
      children: (
        <Suspense fallback={<div>Pending</div>}>
          <Fixture />
        </Suspense>
      ),
    })
  );
  await act(() => handles['workspace-a']!.start());
  const committed = handles['workspace-a']!;
  await act(async () => {
    transition();
  });
  expect(handles['workspace-b']).toBeDefined();
  expect(tree.getByText('Committed A')).toBeDefined();
  await act(() => committed.finish());
  expect(mocks.update).toHaveBeenCalledTimes(2);
  await act(async () => {
    await handles['workspace-b']!.start();
    await handles['workspace-b']!.finish('session-a');
  });
  expect(mocks.update).toHaveBeenCalledTimes(2);
  await act(async () => {
    abandon();
  });
  await act(() => handles['workspace-a']!.start());
  expect(mocks.update).toHaveBeenCalledTimes(3);
  tree.unmount();
});

it('does not resurrect a held preparation across Strict Mode cleanup/replay', async () => {
  let release!: () => void;
  mocks.support.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  let first!: Promise<void>;
  let current!: ReturnType<typeof useMeetingAi>;
  function Fixture() {
    const ai = useMeetingAi('workspace-a', 'meeting-a');
    current = ai;
    useEffect(() => {
      if (!first) first = ai.start();
    }, [ai.start]);
    return null;
  }
  const tree = render(wrapper({ children: <Fixture /> }), {
    reactStrictMode: true,
  });
  await waitFor(() => expect(mocks.support).toHaveBeenCalledTimes(1));
  await act(async () => {
    release();
    await first;
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(current.capturing).toBe(false);
  await act(() => current.start());
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(current.capturing).toBe(true);
  tree.unmount();
});
