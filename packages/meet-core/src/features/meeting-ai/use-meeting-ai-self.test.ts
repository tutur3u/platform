// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { createElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  upload: vi.fn(),
  start: vi.fn(),
  refetch: vi.fn(),
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
  useQueryClient: () => ({ removeQueries: vi.fn() }),
  useQuery: () => ({ data: { sessions: [] }, refetch: mocks.refetch }),
  useMutation: ({ mutationFn }: { mutationFn: unknown }) => ({
    mutateAsync: mutationFn,
  }),
}));
vi.mock('./audio', () => ({
  MeetAudioCapture: class {
    start = mocks.start;
    update() {}
    dispose() {}
    stop = vi.fn();
  },
}));

import { useMeetingAi } from './use-meeting-ai';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ sessionId: 'session' });
});
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(WorkspaceVisibilityProvider, { actorId: 'actor-a', children });

it('starts the session without capturing the room in per-speaker mode', async () => {
  const hook = renderHook(
    () =>
      useMeetingAi('workspace', 'meeting', [], true, true, undefined, {
        captureMode: 'self',
      }),
    { wrapper }
  );
  await act(() => hook.result.current.start());
  expect(mocks.update).toHaveBeenCalledWith('workspace', 'meeting', {
    action: 'start',
  });
  expect(mocks.start).not.toHaveBeenCalled();
  expect(hook.result.current.ownsSession).toBe(true);
  await act(() => hook.result.current.finish());
  const finish = mocks.update.mock.calls.at(-1)![2];
  expect(finish).toMatchObject({ action: 'finish', sessionId: 'session' });
  expect(finish.expectedChunks).toBeUndefined();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('captures the room in room mode', async () => {
  const hook = renderHook(
    () =>
      useMeetingAi('workspace', 'meeting', [], true, true, undefined, {
        captureMode: 'room',
      }),
    { wrapper }
  );
  await act(() => hook.result.current.start());
  expect(mocks.start).toHaveBeenCalledTimes(1);
});
