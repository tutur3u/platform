import { beforeEach, expect, it, vi } from 'vitest';
import { saveProgrammingRoomCheckpoint } from './programming-collaboration';

const mocks = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/realtime/collaboration', () => ({
  collaborationTicketSchema: {},
}));
vi.mock('@tuturuuu/realtime/core/token', () => ({
  signRealtimePayload: vi.fn(),
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: mocks.rpc,
  AccountServiceError: class extends Error {
    constructor(readonly status: number) {
      super('Rejected');
    }
  },
}));
vi.mock('./playground-service', () => ({
  getPlayground: vi.fn(),
  getPlaygroundMetadata: vi.fn(),
  getPlaygroundRun: mocks.run,
  savePlayground: mocks.save,
}));
const payload = { revision: 7, files: [], paths: ['main.py'] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockResolvedValue({ status: 'running' });
  mocks.save.mockResolvedValue({ revision: 8 });
  mocks.rpc.mockResolvedValue({
    actorId: 'owner',
    projectId: 'project',
    revision: 7,
  });
});
for (const status of [
  'succeeded',
  'failed',
  'cancelled',
  'cancel_requested',
  'queued',
]) {
  it(`rejects a delayed runner export after ${status} without saving`, async () => {
    mocks.run.mockResolvedValue({ status });
    await expect(
      saveProgrammingRoomCheckpoint(
        'owner',
        'project',
        payload,
        undefined,
        'old-run',
        'runner',
        true
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.save).not.toHaveBeenCalled();
  });
}
it('requires authoritative lease authorization for a running export', async () => {
  mocks.rpc.mockRejectedValue(new Error('Run replaced during authorization'));
  await expect(
    saveProgrammingRoomCheckpoint(
      'owner',
      'project',
      payload,
      undefined,
      'old-run',
      'runner',
      true
    )
  ).rejects.toThrow();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('retains bound run ID through the final SQL-backed save', async () => {
  await saveProgrammingRoomCheckpoint(
    'owner',
    'project',
    payload,
    undefined,
    'run',
    'runner',
    true
  );
  expect(mocks.rpc).toHaveBeenCalledWith('authorize_playground_callback', {
    p_runner_id: 'runner',
    p_run_id: 'run',
  });
  expect(mocks.save).toHaveBeenCalledWith(
    'owner',
    'project',
    payload,
    'run',
    undefined
  );
});
it('does not relax the lease after cancellation races the final publish', async () => {
  mocks.save.mockRejectedValue(
    new Error('Atomic publish rejected cancelled run')
  );
  await expect(
    saveProgrammingRoomCheckpoint(
      'owner',
      'project',
      payload,
      undefined,
      'run',
      'runner',
      true
    )
  ).rejects.toThrow();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0]?.[3]).toBe('run');
});
it('preserves ordinary editor checkpoints after run completion and clears metadata', async () => {
  mocks.run.mockResolvedValue({ status: 'cancelled' });
  await expect(
    saveProgrammingRoomCheckpoint(
      'owner',
      'project',
      payload,
      undefined,
      'run',
      'runner'
    )
  ).resolves.toEqual({ revision: 8, runComplete: true });
  expect(mocks.save).toHaveBeenCalledWith(
    'owner',
    'project',
    payload,
    undefined,
    undefined
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects runner export without signed run identity', async () => {
  await expect(
    saveProgrammingRoomCheckpoint(
      'owner',
      'project',
      payload,
      undefined,
      undefined,
      undefined,
      true
    )
  ).rejects.toMatchObject({ status: 403 });
  expect(mocks.save).not.toHaveBeenCalled();
});
