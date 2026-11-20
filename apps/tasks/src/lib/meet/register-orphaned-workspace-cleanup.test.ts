import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  imports: 0,
  hooks: null as null | {
    resume: (wsId: string) => Promise<void>;
    deleteWorkspace: (
      wsId: string,
      remove: () => Promise<{ error: unknown }>
    ) => Promise<void>;
  },
  withWorkspace: vi.fn(),
  readPending: vi.fn(),
  commit: vi.fn(),
}));

vi.mock('@tuturuuu/apis/members/route', () => ({
  registerOrphanedWorkspaceCleanup: (hooks: typeof state.hooks) => {
    state.hooks = hooks;
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => {
  state.imports += 1;
  return {
    withWorkspaceAttendanceErasure: (...args: unknown[]) =>
      state.withWorkspace(...args),
    readPendingAttendanceErasure: (...args: unknown[]) =>
      state.readPending(...args),
    commitAttendanceErasure: (...args: unknown[]) => state.commit(...args),
    settleAttendanceErasure: (...args: unknown[]) => state.commit(...args),
  };
});

import { registerTasksOrphanedWorkspaceCleanup } from './register-orphaned-workspace-cleanup';

beforeEach(() => {
  vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'false');
  state.withWorkspace.mockReset();
  state.readPending.mockReset();
  state.commit.mockReset();
  state.withWorkspace.mockImplementation(
    async (_wsId: unknown, remove: unknown) => {
      await (remove as () => Promise<unknown>)();
    }
  );
});

function hooks() {
  if (!state.hooks) throw new Error('cleanup hook was not registered');
  return state.hooks;
}

it('does not load attendance erasure while the switch is off', async () => {
  registerTasksOrphanedWorkspaceCleanup();
  const remove = vi.fn(async () => ({ error: null }));
  await hooks().deleteWorkspace('ws', remove);
  await hooks().resume('ws');
  expect(remove).toHaveBeenCalledOnce();
  expect(state.imports).toBe(0);
  expect(state.readPending).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
});

it('throws the row error while the switch is off', async () => {
  const failure = { code: 'failure' };
  const remove = vi.fn(async () => ({ error: failure }));
  await expect(hooks().deleteWorkspace('ws', remove)).rejects.toBe(failure);
  expect(state.imports).toBe(0);
});

it('prepares erasure only while the switch is on', async () => {
  vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'true');
  const remove = vi.fn(async () => ({ error: null }));
  await hooks().deleteWorkspace('ws', remove);
  expect(state.withWorkspace).toHaveBeenCalledOnce();
  expect(state.imports).toBe(1);
  state.readPending.mockResolvedValue({ phase: 'confirmed' });
  await hooks().resume('ws');
  expect(state.readPending).toHaveBeenCalledWith({
    op: 'workspace',
    wsId: 'ws',
  });
  expect(state.commit).toHaveBeenCalledOnce();
});
