import { InternalApiError } from '@tuturuuu/internal-api/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { EmployeeCreationRecovery } from './employee-creation-recovery';

const actorId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-0000-0000-000000000000';
const payload = {
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: 'do-not-retain-123',
};
let time = 1000;
const observe = vi.fn();
const active = vi.fn();
function session(actor = actorId, workspace = workspaceId) {
  const result = new EmployeeCreationRecovery({
    actorId: actor,
    workspaceId: workspace,
    storage: sessionStorage,
    assertActive: active,
    now: () => time,
    observe,
  });
  result.activate();
  return result;
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  time = 1000;
  observe.mockImplementation(async (value) => ({
    status: 'pending',
    operationId: value.operationId,
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  }));
});
it('persists only validated scoped identity before dispatch and recovers the same UUID after remount', async () => {
  const original = session();
  const reference = original.prepare(payload);
  expect(sessionStorage.getItem(original.key)).not.toContain(
    payload.temporaryPassword
  );
  expect(sessionStorage.getItem(original.key)).not.toContain(
    'temporaryPassword'
  );
  original.retire();
  const remount = session();
  expect(remount.load()).toEqual(reference);
  await remount.read();
  expect(observe.mock.calls[0]?.[0].operationId).toBe(reference.operationId);
  expect(() => remount.prepare(payload)).toThrow('Unresolved');
  expect(session('10000000-0000-4000-8000-000000000002').load()).toBeNull();
  expect(
    session(actorId, '10000000-0000-4000-8000-000000000003').load()
  ).toBeNull();
});
it('bounds total read attempts across remounts and never resets an exhausted deadline', async () => {
  let current = session();
  current.prepare(payload);
  for (let count = 0; count < 6; count++) {
    await current.read();
    current.retire();
    current = session();
    current.load();
  }
  await current.read();
  expect(observe).toHaveBeenCalledTimes(6);
  expect(current.canRead()).toBe(false);
});
it('stops when elapsed budget expires and preserves the unresolved reference', async () => {
  const current = session();
  current.prepare(payload);
  await current.read();
  time += 30_000;
  await current.read();
  expect(observe).toHaveBeenCalledTimes(1);
  expect(current.load()).not.toBeNull();
});
it('rejects corrupted storage before creating a replacement operation', () => {
  const current = session();
  sessionStorage.setItem(current.key, '{bad');
  expect(() => current.prepare(payload)).toThrow();
  expect(observe).not.toHaveBeenCalled();
});
it('stops permission denial without replay and retains the reference', async () => {
  const current = session();
  current.prepare(payload);
  observe.mockRejectedValue(new InternalApiError('denied', 403));
  await current.read();
  await current.read();
  expect(current.reference?.state).toBe('stopped');
  expect(observe).toHaveBeenCalledTimes(1);
});
it('ignores a late result after retirement', async () => {
  let resolve: (value: unknown) => void = () => {};
  observe.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const current = session();
  const original = current.prepare(payload);
  const pending = current.read();
  current.retire();
  resolve({
    status: 'created',
    operationId: original.operationId,
    account: {
      id: actorId,
      email: payload.email,
      displayName: payload.displayName,
    },
  });
  await expect(pending).rejects.toThrow('retired');
  expect(sessionStorage.getItem(current.key)).not.toBeNull();
});
it('clears the reference only on confirmed completion', async () => {
  const current = session();
  const original = current.prepare(payload);
  observe.mockResolvedValue({
    status: 'created',
    operationId: original.operationId,
    account: {
      id: actorId,
      email: payload.email,
      displayName: payload.displayName,
    },
  });
  expect((await current.read())?.status).toBe('created');
  expect(current.load()).toBeNull();
});
it('preserves terminal conflicts across remount without an observation', async () => {
  const original = session();
  original.prepare(payload);
  original.stop('conflict');
  original.retire();
  const remount = session();
  expect(remount.load()?.state).toBe('conflict');
  await remount.read();
  expect(observe).not.toHaveBeenCalled();
});
it('starts the recovery budget after a slow original request rather than expiring before uncertainty', async () => {
  const original = session();
  original.prepare(payload);
  time += 60_000;
  await original.read();
  expect(observe).toHaveBeenCalledTimes(1);
  expect(original.reference?.startedAt).toBe(time);
});
it('stops safely when persisting the read budget fails', async () => {
  const original = session();
  original.prepare(payload);
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('quota');
    });
  await original.read();
  expect(observe).not.toHaveBeenCalled();
  expect(original.canRead()).toBe(false);
  write.mockRestore();
});
it('stops denial even when persisting the terminal state fails', async () => {
  const current = session();
  current.prepare(payload);
  observe.mockImplementation(async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    throw new InternalApiError('denied', 403);
  });
  try {
    await expect(current.read()).resolves.toBeNull();
    expect(current.canRead()).toBe(false);
  } finally {
    vi.restoreAllMocks();
  }
});
